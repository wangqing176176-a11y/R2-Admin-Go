import { getEnvString, requireEnvString } from "@/lib/env";
import { toChineseErrorMessage } from "@/lib/error-zh";

export type SupabaseUser = {
  id: string;
  email?: string | null;
};

export const getSupabaseConfig = () => {
  const url = requireEnvString("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL").replace(/\/$/, "");
  const anonKey = requireEnvString(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
  );
  return { url, anonKey };
};

export const getBearerToken = (req: Request) => {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!auth) return "";
  const [kind, token] = auth.split(/\s+/, 2);
  if (!kind || !token) return "";
  return /^bearer$/i.test(kind) ? token.trim() : "";
};

const readJsonSafe = async (res: Response): Promise<Record<string, unknown>> => {
  try {
    const data = (await res.json()) as Record<string, unknown>;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
};

const pickSupabaseError = (obj: Record<string, unknown>, fallback: string) => {
  const msg = String(obj.msg ?? obj.error_description ?? obj.error ?? obj.message ?? "").trim();
  return toChineseErrorMessage(msg || fallback, fallback);
};

const SUPABASE_AUTH_CACHE_TTL_MS = 30_000;
const SUPABASE_AUTH_CACHE_MAX = 256;
const SUPABASE_AUTH_FAIL_CACHE_TTL_MS = 5_000;

type SupabaseAuthOkEntry = {
  user: SupabaseUser;
  untilMs: number;
};

type SupabaseAuthCacheStore = {
  ok: Map<string, SupabaseAuthOkEntry>;
  fail: Map<string, number>;
  inflight: Map<string, Promise<{ token: string; user: SupabaseUser }>>;
};

const SUPABASE_AUTH_CACHE_SYM = Symbol.for("__r2_supabase_auth_cache_v1__");

const getSupabaseAuthCacheStore = (): SupabaseAuthCacheStore => {
  const g = globalThis as unknown as Record<symbol, unknown>;
  const existing = g[SUPABASE_AUTH_CACHE_SYM] as SupabaseAuthCacheStore | undefined;
  if (existing) return existing;
  const created: SupabaseAuthCacheStore = {
    ok: new Map<string, SupabaseAuthOkEntry>(),
    fail: new Map<string, number>(),
    inflight: new Map<string, Promise<{ token: string; user: SupabaseUser }>>(),
  };
  g[SUPABASE_AUTH_CACHE_SYM] = created;
  return created;
};

const pruneSupabaseAuthCache = (store: SupabaseAuthCacheStore, nowMs: number) => {
  for (const [token, untilMs] of store.fail.entries()) {
    if (untilMs <= nowMs) store.fail.delete(token);
  }
  for (const [token, entry] of store.ok.entries()) {
    if (entry.untilMs <= nowMs) store.ok.delete(token);
  }

  while (store.ok.size > SUPABASE_AUTH_CACHE_MAX) {
    const oldest = store.ok.keys().next();
    if (oldest.done) break;
    store.ok.delete(oldest.value);
  }
  while (store.fail.size > SUPABASE_AUTH_CACHE_MAX) {
    const oldest = store.fail.keys().next();
    if (oldest.done) break;
    store.fail.delete(oldest.value);
  }
};

const decodeBase64UrlUtf8 = (input: string) => {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  if (typeof Buffer !== "undefined") return Buffer.from(padded, "base64").toString("utf8");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

const readJwtExpMs = (token: string): number | null => {
  const parts = token.split(".", 3);
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const payloadRaw = decodeBase64UrlUtf8(parts[1]);
    const payload = JSON.parse(payloadRaw) as { exp?: unknown };
    const exp = Number(payload.exp ?? NaN);
    if (!Number.isFinite(exp) || exp <= 0) return null;
    return exp * 1000;
  } catch {
    return null;
  }
};

const getAuthCacheTtlMs = (token: string, nowMs: number) => {
  const expMs = readJwtExpMs(token);
  if (!expMs) return SUPABASE_AUTH_CACHE_TTL_MS;
  const remainingMs = expMs - nowMs - 1_000;
  if (remainingMs <= 0) return 0;
  return Math.min(SUPABASE_AUTH_CACHE_TTL_MS, remainingMs);
};

const createUnauthorizedError = (message: string) => {
  const err = new Error(message) as Error & { status?: number };
  err.status = 401;
  return err;
};

export const requireSupabaseUser = async (req: Request) => {
  const token = getBearerToken(req);
  if (!token) {
    throw createUnauthorizedError("登录状态已失效，请重新登录。");
  }

  const nowMs = Date.now();
  const store = getSupabaseAuthCacheStore();
  pruneSupabaseAuthCache(store, nowMs);

  const failedUntilMs = store.fail.get(token);
  if (failedUntilMs && failedUntilMs > nowMs) {
    throw createUnauthorizedError("登录状态已失效，请重新登录。");
  }

  const cached = store.ok.get(token);
  if (cached && cached.untilMs > nowMs) {
    return { token, user: cached.user };
  }
  if (cached) store.ok.delete(token);

  const pending = store.inflight.get(token);
  if (pending) return await pending;

  const verifyPromise = (async () => {
    const { url, anonKey } = getSupabaseConfig();
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await readJsonSafe(res);
    if (!res.ok || !data.id) {
      if (res.status === 401) {
        store.fail.set(token, Date.now() + SUPABASE_AUTH_FAIL_CACHE_TTL_MS);
      }
      throw createUnauthorizedError(pickSupabaseError(data, "登录状态已失效，请重新登录。"));
    }

    const user: SupabaseUser = {
      id: String(data.id),
      email: typeof data.email === "string" ? data.email : null,
    };

    const ttlMs = getAuthCacheTtlMs(token, Date.now());
    if (ttlMs > 0) {
      store.ok.set(token, { user, untilMs: Date.now() + ttlMs });
      store.fail.delete(token);
    }

    return { token, user };
  })().finally(() => {
    store.inflight.delete(token);
    pruneSupabaseAuthCache(store, Date.now());
  });

  store.inflight.set(token, verifyPromise);
  return await verifyPromise;
};

export const supabaseRestFetch = async (pathWithQuery: string, opts: {
  token: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  prefer?: string;
  headers?: Record<string, string>;
}) => {
  const { url, anonKey } = getSupabaseConfig();
  const method = opts.method ?? "GET";

  const headers = new Headers(opts.headers ?? {});
  headers.set("apikey", anonKey);
  headers.set("Authorization", `Bearer ${opts.token}`);
  if (opts.body !== undefined) headers.set("Content-Type", "application/json");
  if (opts.prefer) headers.set("Prefer", opts.prefer);

  return await fetch(`${url}/rest/v1/${pathWithQuery}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
};

export const readSupabaseRestJson = async <T>(res: Response, fallbackError = "Supabase request failed"): Promise<T> => {
  const data = await readJsonSafe(res);
  if (!res.ok) {
    throw new Error(pickSupabaseError(data, fallbackError));
  }
  return data as T;
};

export const readSupabaseRestArray = async <T>(res: Response, fallbackError = "Supabase request failed"): Promise<T[]> => {
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = [];
  }
  if (!res.ok) {
    const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    throw new Error(pickSupabaseError(obj, fallbackError));
  }
  return Array.isArray(data) ? (data as T[]) : [];
};

export const getClientSupabaseConfig = () => {
  const url = (getEnvString("NEXT_PUBLIC_SUPABASE_URL") || "").replace(/\/$/, "");
  const anonKey =
    getEnvString("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    getEnvString("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return { url, anonKey };
};
