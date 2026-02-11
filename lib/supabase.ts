import { getEnvString, requireEnvString } from "@/lib/env";

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
  return msg || fallback;
};

export const requireSupabaseUser = async (req: Request) => {
  const token = getBearerToken(req);
  if (!token) {
    const err = new Error("Unauthorized") as Error & { status?: number };
    err.status = 401;
    throw err;
  }

  const { url, anonKey } = getSupabaseConfig();
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await readJsonSafe(res);
  if (!res.ok || !data.id) {
    const err = new Error(pickSupabaseError(data, "Unauthorized")) as Error & { status?: number };
    err.status = 401;
    throw err;
  }

  return {
    token,
    user: {
      id: String(data.id),
      email: typeof data.email === "string" ? data.email : null,
    } as SupabaseUser,
  };
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
