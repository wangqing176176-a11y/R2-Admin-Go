"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";

export type FileEditorParticipant = {
  id: string;
  name: string;
  onlineAt?: string;
};

type FileEditorPresencePayload = {
  user_id?: unknown;
  user_name?: unknown;
  editing?: unknown;
  online_at?: unknown;
};

type UseFileEditorPresenceOptions = {
  enabled: boolean;
  editing: boolean;
  supabaseUrl: string;
  supabaseKey: string;
  teamId: string;
  bucketId: string;
  objectKey: string;
  userId: string;
  userName: string;
  getAccessToken: () => Promise<string | null>;
};

type SharedRealtimeClientEntry = {
  client: SupabaseClient;
  tokenProvider: { current: () => Promise<string | null> };
  pendingRemovals: Map<string, Promise<void>>;
};

type FallbackControl = {
  scopeId: string;
  activate: () => void;
  refreshShadow: () => void;
};

const CONNECTION_FAILURE_LIMIT = 3;
const TRACK_RETRY_DELAYS_MS = [0, 500, 1_500] as const;
const FALLBACK_DELAY_MS = 3_000;
const FALLBACK_POLL_INTERVAL_MS = 10_000;
const FALLBACK_HEARTBEAT_INTERVAL_MS = 15_000;
const REALTIME_IDLE_DISCONNECT_MS = 2 * 60_000;
const SNAPSHOT_CACHE_TTL_MS = 60_000;
const SNAPSHOT_CACHE_MAX = 100;

const sharedRealtimeClients = new Map<string, SharedRealtimeClientEntry>();
const editorSnapshotCache = new Map<string, { editors: FileEditorParticipant[]; updatedAt: number }>();

const wait = (delayMs: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, delayMs);
});

const hashDocumentIdentity = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
};

const createSessionId = () => typeof crypto.randomUUID === "function"
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Client modules are instantiated once per browser tab. Pairing this stable tab id
// with the user id keeps Presence keys unique without mutating a ref during render.
const TAB_SESSION_ID = createSessionId();

const createPresenceKey = (userId: string, sessionId: string) => `${userId}:${sessionId}`;

export type FileEditorPresenceStatus = "idle" | "connecting" | "connected" | "fallback" | "error";

const getSharedRealtimeClient = (
  supabaseUrl: string,
  supabaseKey: string,
  getAccessToken: () => Promise<string | null>,
) => {
  const cacheKey = `${supabaseUrl}\n${supabaseKey}`;
  const existing = sharedRealtimeClients.get(cacheKey);
  if (existing) {
    existing.tokenProvider.current = getAccessToken;
    return existing;
  }

  const tokenProvider = { current: getAccessToken };
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    realtime: {
      disconnectOnEmptyChannelsAfterMs: REALTIME_IDLE_DISCONNECT_MS,
    },
    accessToken: async () => await tokenProvider.current(),
  });
  const created: SharedRealtimeClientEntry = {
    client,
    tokenProvider,
    pendingRemovals: new Map(),
  };
  sharedRealtimeClients.set(cacheKey, created);
  return created;
};

const removeSharedChannel = (
  entry: SharedRealtimeClientEntry,
  topic: string,
  channel: RealtimeChannel,
) => {
  const pending = entry.client.removeChannel(channel)
    .catch((error) => {
      console.warn("[File Editor Presence] Failed to remove channel", error);
    })
    .then(() => undefined);
  entry.pendingRemovals.set(topic, pending);
  void pending.finally(() => {
    if (entry.pendingRemovals.get(topic) === pending) entry.pendingRemovals.delete(topic);
  });
};

const cacheEditors = (scopeId: string, editors: FileEditorParticipant[]) => {
  editorSnapshotCache.delete(scopeId);
  editorSnapshotCache.set(scopeId, { editors, updatedAt: Date.now() });
  while (editorSnapshotCache.size > SNAPSHOT_CACHE_MAX) {
    const oldest = editorSnapshotCache.keys().next();
    if (oldest.done) break;
    editorSnapshotCache.delete(oldest.value);
  }
};

const readCachedEditors = (scopeId: string) => {
  const cached = editorSnapshotCache.get(scopeId);
  if (!cached) return null;
  if (Date.now() - cached.updatedAt > SNAPSHOT_CACHE_TTL_MS) {
    editorSnapshotCache.delete(scopeId);
    return null;
  }
  return cached.editors;
};

const readEditors = (channel: RealtimeChannel): FileEditorParticipant[] => {
  const users = new Map<string, FileEditorParticipant>();
  const state = channel.presenceState<FileEditorPresencePayload>();
  for (const presences of Object.values(state)) {
    for (const presence of presences) {
      if (presence.editing !== true) continue;
      const id = String(presence.user_id ?? "").trim().slice(0, 128);
      const name = String(presence.user_name ?? "").trim().slice(0, 128);
      if (!id || !name) continue;
      const onlineAt = String(presence.online_at ?? "").trim().slice(0, 64) || undefined;
      const existing = users.get(id);
      if (!existing || (onlineAt && (!existing.onlineAt || onlineAt < existing.onlineAt))) {
        users.set(id, { id, name, onlineAt });
      }
    }
  }
  return Array.from(users.values()).sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
};

const sameEditors = (left: FileEditorParticipant[], right: FileEditorParticipant[]) =>
  left.length === right.length
  && left.every((user, index) => (
    user.id === right[index]?.id
    && user.name === right[index]?.name
    && user.onlineAt === right[index]?.onlineAt
  ));

const parseFallbackEditors = (value: unknown): FileEditorParticipant[] => {
  if (!Array.isArray(value)) return [];
  const users = new Map<string, FileEditorParticipant>();
  for (const item of value) {
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim().slice(0, 128);
    const name = String(row.name ?? "").trim().slice(0, 128);
    const onlineAt = String(row.onlineAt ?? "").trim().slice(0, 64) || undefined;
    if (!id || !name) continue;
    const existing = users.get(id);
    if (!existing || (onlineAt && (!existing.onlineAt || onlineAt < existing.onlineAt))) {
      users.set(id, { id, name, onlineAt });
    }
  }
  return Array.from(users.values()).sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
};

export default function useFileEditorPresence({
  enabled,
  editing,
  supabaseUrl,
  supabaseKey,
  teamId,
  bucketId,
  objectKey,
  userId,
  userName,
  getAccessToken,
}: UseFileEditorPresenceOptions) {
  const scopeId = `${teamId}\n${bucketId}\n${objectKey}`;
  const [editorSnapshot, setEditorSnapshot] = useState<{ scopeId: string; editors: FileEditorParticipant[] }>({
    scopeId: "",
    editors: [],
  });
  const [connectionSnapshot, setConnectionSnapshot] = useState<{
    scopeId: string;
    status: Exclude<FileEditorPresenceStatus, "idle">;
  }>({ scopeId: "", status: "connecting" });
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const trackedSignatureRef = useRef<string | null>(null);
  const connectionFailureCountRef = useRef(0);
  const getAccessTokenRef = useRef(getAccessToken);
  const identityRef = useRef({ userId, userName, scopeId, editing });
  const fallbackControlRef = useRef<FallbackControl | null>(null);

  useEffect(() => {
    getAccessTokenRef.current = getAccessToken;
  }, [getAccessToken]);

  useEffect(() => {
    identityRef.current = { userId, userName, scopeId, editing };
  }, [editing, scopeId, userId, userName]);

  const trackCurrentEditor = useCallback(async () => {
    const channel = channelRef.current;
    if (!channel || !subscribedRef.current) return;
    const current = identityRef.current;
    if (!current.editing) {
      if (trackedSignatureRef.current === null) return;
      try {
        await channel.untrack();
        trackedSignatureRef.current = null;
      } catch (error) {
        console.warn("[File Editor Presence] Failed to clear editor state", error);
      }
      return;
    }
    const signature = `${current.userId}\n${current.userName}`;
    if (trackedSignatureRef.current === signature) return;
    for (let attempt = 0; attempt < TRACK_RETRY_DELAYS_MS.length; attempt += 1) {
      const delayMs = TRACK_RETRY_DELAYS_MS[attempt];
      if (delayMs > 0) await wait(delayMs);
      if (channelRef.current !== channel || !subscribedRef.current) return;
      try {
        const result = await channel.track({
          user_id: current.userId,
          user_name: current.userName,
          editing: true,
          online_at: new Date().toISOString(),
        });
        if (result === "ok") {
          trackedSignatureRef.current = signature;
          return;
        }
      } catch (error) {
        console.warn(`[File Editor Presence] Failed to publish editor state (${attempt + 1}/${TRACK_RETRY_DELAYS_MS.length})`, error);
      }
    }
    if (channelRef.current === channel && subscribedRef.current) {
      setConnectionSnapshot({ scopeId: current.scopeId, status: "connecting" });
      fallbackControlRef.current?.activate();
    }
  }, []);

  useEffect(() => {
    if (!enabled || !teamId || !bucketId || !objectKey || !userId) return;

    const sessionId = TAB_SESSION_ID;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let sharedEntry: SharedRealtimeClientEntry | null = null;
    let topic = "";
    let documentHash = "";
    let realtimeReady = false;
    let fallbackActive = false;
    let fallbackReady = false;
    let fallbackUnavailable = false;
    let fallbackWarningLogged = false;
    let shadowAttempted = false;
    let shadowEverAttempted = false;
    let fallbackDelayTimer: number | null = null;
    let fallbackPollTimer: number | null = null;
    let fallbackHeartbeatTimer: number | null = null;
    let fallbackQueue = Promise.resolve();

    connectionFailureCountRef.current = 0;
    subscribedRef.current = false;
    trackedSignatureRef.current = null;

    const setEditors = (editors: FileEditorParticipant[]) => {
      cacheEditors(scopeId, editors);
      setEditorSnapshot((current) => current.scopeId === scopeId && sameEditors(current.editors, editors)
        ? current
        : { scopeId, editors });
    };

    const stopFallbackPolling = () => {
      if (fallbackDelayTimer !== null) window.clearTimeout(fallbackDelayTimer);
      if (fallbackPollTimer !== null) window.clearInterval(fallbackPollTimer);
      fallbackDelayTimer = null;
      fallbackPollTimer = null;
      fallbackActive = false;
      fallbackReady = false;
    };

    const requestFallback = async (
      action: "read" | "track" | "untrack",
      options: { apply?: boolean; keepalive?: boolean } = {},
    ) => {
      if (!documentHash || fallbackUnavailable) return;
      const accessToken = await getAccessTokenRef.current();
      if (!accessToken) throw new Error("登录状态已失效");
      const response = await fetch("/api/file-presence", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        keepalive: options.keepalive === true,
        body: JSON.stringify({
          action,
          bucketId,
          documentHash,
          sessionId,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { editors?: unknown; error?: unknown };
      if (!response.ok) {
        const error = new Error(String(data.error ?? "协作兼容服务暂不可用")) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      if (action === "track") shadowAttempted = true;
      if (action === "untrack") shadowAttempted = false;
      if (!cancelled && fallbackActive && options.apply !== false) {
        setEditors(parseFallbackEditors(data.editors));
        fallbackReady = true;
        setConnectionSnapshot({ scopeId, status: "fallback" });
      }
    };

    const enqueueFallback = (
      action: "read" | "track" | "untrack",
      options?: { apply?: boolean; keepalive?: boolean },
    ) => {
      fallbackQueue = fallbackQueue
        .catch(() => undefined)
        .then(async () => {
          try {
            await requestFallback(action, options);
          } catch (error) {
            const status = Number((error as { status?: unknown })?.status ?? NaN);
            if (status === 503) {
              fallbackUnavailable = true;
              stopFallbackPolling();
            }
            if (!fallbackWarningLogged) {
              fallbackWarningLogged = true;
              console.warn("[File Editor Presence] Same-origin fallback unavailable", error);
            }
          }
        });
      return fallbackQueue;
    };

    const refreshShadow = () => {
      if (cancelled || fallbackUnavailable || !documentHash) return;
      if (identityRef.current.editing) {
        shadowAttempted = true;
        shadowEverAttempted = true;
        void enqueueFallback("track", { apply: fallbackActive });
      } else if (shadowAttempted) {
        shadowAttempted = false;
        void enqueueFallback("untrack", { apply: fallbackActive });
      } else if (fallbackActive) {
        void enqueueFallback("read");
      }
    };

    const activateFallback = () => {
      if (cancelled || realtimeReady || fallbackActive || fallbackUnavailable) return;
      fallbackActive = true;
      refreshShadow();
      fallbackPollTimer = window.setInterval(() => {
        if (!cancelled && fallbackActive) void enqueueFallback("read");
      }, FALLBACK_POLL_INTERVAL_MS);
    };

    const scheduleFallback = () => {
      if (fallbackDelayTimer !== null || fallbackActive || fallbackUnavailable) return;
      fallbackDelayTimer = window.setTimeout(() => {
        fallbackDelayTimer = null;
        activateFallback();
      }, FALLBACK_DELAY_MS);
    };

    fallbackControlRef.current = { scopeId, activate: activateFallback, refreshShadow };

    void (async () => {
      // Defer UI synchronization to the async connection task so this effect
      // remains an external subscription setup rather than a render cascade.
      await Promise.resolve();
      if (cancelled) return;
      setConnectionSnapshot({ scopeId, status: "connecting" });
      const cachedEditors = readCachedEditors(scopeId);
      if (cachedEditors) setEditorSnapshot({ scopeId, editors: cachedEditors });

      documentHash = await hashDocumentIdentity(`${bucketId}\n${objectKey}`);
      if (cancelled) return;

      // Start the deadline before token lookup / WebSocket setup. Slow auth or
      // DNS must not postpone the same-origin fallback beyond three seconds.
      scheduleFallback();
      refreshShadow();
      fallbackHeartbeatTimer = window.setInterval(() => {
        if (!cancelled && identityRef.current.editing) refreshShadow();
      }, FALLBACK_HEARTBEAT_INTERVAL_MS);

      if (!supabaseUrl || !supabaseKey) {
        activateFallback();
        return;
      }

      sharedEntry = getSharedRealtimeClient(supabaseUrl, supabaseKey, async () => await getAccessTokenRef.current());
      topic = `file-presence:${teamId}:${documentHash}`;
      const pendingRemoval = sharedEntry.pendingRemovals.get(topic);
      if (pendingRemoval) await pendingRemoval;
      if (cancelled) return;

      const accessToken = await getAccessTokenRef.current();
      if (accessToken) await sharedEntry.client.realtime.setAuth(accessToken);
      if (cancelled) return;

      channel = sharedEntry.client.channel(topic, {
        config: {
          private: true,
          presence: {
            enabled: true,
            key: createPresenceKey(userId, sessionId),
          },
        },
      });
      channelRef.current = channel;
      channel
        .on("presence", { event: "sync" }, () => {
          if (cancelled || !channel) return;
          realtimeReady = true;
          connectionFailureCountRef.current = 0;
          stopFallbackPolling();
          setEditors(readEditors(channel));
          setConnectionSnapshot({ scopeId, status: "connected" });
        })
        .subscribe((status, error) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            connectionFailureCountRef.current = 0;
            subscribedRef.current = true;
            scheduleFallback();
            void trackCurrentEditor();
            return;
          }
          subscribedRef.current = false;
          trackedSignatureRef.current = null;
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            realtimeReady = false;
            connectionFailureCountRef.current = Math.min(
              connectionFailureCountRef.current + 1,
              CONNECTION_FAILURE_LIMIT,
            );
            const exhausted = connectionFailureCountRef.current >= CONNECTION_FAILURE_LIMIT;
            if (!fallbackReady) {
              setConnectionSnapshot({ scopeId, status: exhausted ? "error" : "connecting" });
            }
            scheduleFallback();
            console.warn(
              `[File Editor Presence] Realtime channel unavailable (${connectionFailureCountRef.current}/${CONNECTION_FAILURE_LIMIT})`,
              error,
            );
          }
        });
    })().catch((error) => {
      if (!cancelled) {
        console.warn("[File Editor Presence] Failed to start Realtime", error);
        activateFallback();
      }
    });

    return () => {
      cancelled = true;
      connectionFailureCountRef.current = 0;
      subscribedRef.current = false;
      channelRef.current = null;
      trackedSignatureRef.current = null;
      stopFallbackPolling();
      if (fallbackHeartbeatTimer !== null) window.clearInterval(fallbackHeartbeatTimer);
      fallbackHeartbeatTimer = null;
      if (fallbackControlRef.current?.scopeId === scopeId) fallbackControlRef.current = null;

      if (shadowEverAttempted && documentHash && !fallbackUnavailable) {
        void fallbackQueue
          .catch(() => undefined)
          .then(() => requestFallback("untrack", { apply: false, keepalive: true }))
          .catch(() => undefined);
      }
      if (channel && sharedEntry && topic) removeSharedChannel(sharedEntry, topic, channel);
    };
  }, [bucketId, enabled, objectKey, scopeId, supabaseKey, supabaseUrl, teamId, trackCurrentEditor, userId]);

  useEffect(() => {
    if (!enabled) return;
    void trackCurrentEditor();
    fallbackControlRef.current?.refreshShadow();
  }, [editing, enabled, trackCurrentEditor, userId, userName]);

  const scopeConfigured = Boolean(teamId && bucketId && objectKey && userId);
  return {
    editors: enabled && editorSnapshot.scopeId === scopeId ? editorSnapshot.editors : [],
    status: !enabled
      ? "idle" as const
      : !scopeConfigured
        ? "connecting" as const
        : connectionSnapshot.scopeId === scopeId
          ? connectionSnapshot.status
          : "connecting" as const,
  };
}
