"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

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

const hashDocumentIdentity = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
};

const createPresenceKey = (userId: string) => {
  const tabId = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${userId}:${tabId}`;
};

export type FileEditorPresenceStatus = "idle" | "connecting" | "connected" | "error";

const CONNECTION_FAILURE_LIMIT = 3;
const TRACK_RETRY_DELAYS_MS = [0, 500, 1_500] as const;

const wait = (delayMs: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, delayMs);
});

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
      setConnectionSnapshot({ scopeId: current.scopeId, status: "error" });
    }
  }, []);

  useEffect(() => {
    if (!enabled || !supabaseUrl || !supabaseKey || !teamId || !bucketId || !objectKey || !userId) {
      return;
    }

    let cancelled = false;
    connectionFailureCountRef.current = 0;
    const client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      accessToken: async () => await getAccessTokenRef.current(),
    });
    let channel: RealtimeChannel | null = null;

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setConnectionSnapshot({ scopeId, status: "connecting" });
      const documentHash = await hashDocumentIdentity(`${bucketId}\n${objectKey}`);
      if (cancelled) return;

      channel = client.channel(`file-presence:${teamId}:${documentHash}`, {
        config: {
          private: true,
          presence: {
            enabled: true,
            key: createPresenceKey(userId),
          },
        },
      });
      channelRef.current = channel;
      channel
        .on("presence", { event: "sync" }, () => {
          if (!cancelled && channel) {
            const nextEditors = readEditors(channel);
            setEditorSnapshot((current) => current.scopeId === scopeId && sameEditors(current.editors, nextEditors)
              ? current
              : { scopeId, editors: nextEditors });
          }
        })
        .subscribe((status, error) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            connectionFailureCountRef.current = 0;
            subscribedRef.current = true;
            setConnectionSnapshot({ scopeId, status: "connected" });
            void trackCurrentEditor();
            return;
          }
          subscribedRef.current = false;
          trackedSignatureRef.current = null;
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            connectionFailureCountRef.current = Math.min(
              connectionFailureCountRef.current + 1,
              CONNECTION_FAILURE_LIMIT,
            );
            const exhausted = connectionFailureCountRef.current >= CONNECTION_FAILURE_LIMIT;
            setConnectionSnapshot({ scopeId, status: exhausted ? "error" : "connecting" });
            console.warn(
              `[File Editor Presence] Realtime channel unavailable (${connectionFailureCountRef.current}/${CONNECTION_FAILURE_LIMIT})`,
              error,
            );
          }
        });
    })().catch((error) => {
      if (!cancelled) {
        setConnectionSnapshot({ scopeId, status: "error" });
        console.warn("[File Editor Presence] Failed to start", error);
      }
    });

    return () => {
      cancelled = true;
      connectionFailureCountRef.current = 0;
      subscribedRef.current = false;
      channelRef.current = null;
      const wasTracked = trackedSignatureRef.current !== null;
      trackedSignatureRef.current = null;
      if (!channel) return;
      if (wasTracked) {
        void channel.untrack().catch(() => undefined).finally(() => {
          void client.removeChannel(channel!);
        });
      } else {
        void client.removeChannel(channel);
      }
    };
  }, [bucketId, enabled, objectKey, scopeId, supabaseKey, supabaseUrl, teamId, trackCurrentEditor, userId]);

  useEffect(() => {
    if (enabled) void trackCurrentEditor();
  }, [editing, enabled, trackCurrentEditor, userId, userName]);

  const serviceConfigured = Boolean(supabaseUrl && supabaseKey);
  const scopeConfigured = Boolean(teamId && bucketId && objectKey && userId);
  return {
    editors: enabled && editorSnapshot.scopeId === scopeId ? editorSnapshot.editors : [],
    status: !enabled
      ? "idle" as const
      : !serviceConfigured
        ? "error" as const
        : !scopeConfigured
          ? "connecting" as const
        : connectionSnapshot.scopeId === scopeId
          ? connectionSnapshot.status
          : "connecting" as const,
  };
}
