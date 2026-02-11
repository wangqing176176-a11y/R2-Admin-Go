export type EnvLike = Record<string, unknown>;

export const getEnv = (): EnvLike => {
  // Cloudflare Pages / Workers request context.
  const sym = Symbol.for("__cloudflare-request-context__");
  const g = globalThis as unknown as Record<symbol, unknown>;
  const ctx = g[sym] as { env?: EnvLike } | undefined;
  if (ctx?.env) return ctx.env;

  // Local dev fallback.
  const p = (globalThis as unknown as { process?: { env?: Record<string, unknown> } }).process;
  return p?.env ?? {};
};

export const getEnvString = (...keys: string[]): string => {
  const env = getEnv();
  for (const key of keys) {
    const value = String(env[key] ?? "").trim();
    if (value) return value;
  }
  return "";
};

export const requireEnvString = (name: string, ...fallbackKeys: string[]): string => {
  const value = getEnvString(name, ...fallbackKeys);
  if (value) return value;
  throw new Error(`Missing environment variable: ${name}`);
};
