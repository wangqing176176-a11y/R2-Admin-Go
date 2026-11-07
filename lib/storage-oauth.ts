import type { AppAccessContext } from "@/lib/access-control";
import { issueSealedPayload, readSealedPayload } from "@/lib/crypto";
import { getEnvString } from "@/lib/env";
import type { StorageProvider, UpsertBucketInput } from "@/lib/user-buckets";

export type StorageOAuthProvider = Extract<StorageProvider, "onedrive" | "google_drive" | "dropbox">;

type StorageOAuthConfig = {
  clientId: string;
  clientSecret: string;
  tenantId?: string;
};

type StorageOAuthState = {
  kind: "storage-oauth-state";
  provider: StorageOAuthProvider;
  userId: string;
  teamId: string;
  redirectUri: string;
  openerOrigin: string;
};

export type StorageOAuthCallbackState = Pick<StorageOAuthState, "provider" | "openerOrigin">;

type StorageOAuthGrant = {
  kind: "storage-oauth-grant";
  provider: StorageOAuthProvider;
  userId: string;
  teamId: string;
  accessToken: string;
  refreshToken: string;
  clientId: string;
  tenantId?: string;
};

const OAUTH_PROVIDERS = new Set<StorageOAuthProvider>(["onedrive", "google_drive", "dropbox"]);

export const isStorageOAuthProvider = (value: unknown): value is StorageOAuthProvider =>
  OAUTH_PROVIDERS.has(String(value ?? "") as StorageOAuthProvider);

export const getStorageOAuthConfig = (provider: StorageOAuthProvider): StorageOAuthConfig | null => {
  if (provider === "onedrive") {
    const clientId = getEnvString("ONEDRIVE_OAUTH_CLIENT_ID", "MICROSOFT_OAUTH_CLIENT_ID");
    const clientSecret = getEnvString("ONEDRIVE_OAUTH_CLIENT_SECRET", "MICROSOFT_OAUTH_CLIENT_SECRET");
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      tenantId: getEnvString("ONEDRIVE_OAUTH_TENANT_ID", "MICROSOFT_OAUTH_TENANT_ID") || "common",
    };
  }
  if (provider === "google_drive") {
    const clientId = getEnvString("GOOGLE_DRIVE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = getEnvString("GOOGLE_DRIVE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET");
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  }
  const clientId = getEnvString("DROPBOX_OAUTH_CLIENT_ID", "DROPBOX_APP_KEY");
  const clientSecret = getEnvString("DROPBOX_OAUTH_CLIENT_SECRET", "DROPBOX_APP_SECRET");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
};

const providerName = (provider: StorageOAuthProvider) =>
  provider === "onedrive" ? "OneDrive" : provider === "google_drive" ? "Google Drive" : "Dropbox";

const requireStorageOAuthConfig = (provider: StorageOAuthProvider) => {
  const config = getStorageOAuthConfig(provider);
  if (config) return config;
  const prefix = provider === "onedrive" ? "ONEDRIVE" : provider === "google_drive" ? "GOOGLE_DRIVE" : "DROPBOX";
  throw new Error(`${providerName(provider)} 一键授权尚未配置，请设置 ${prefix}_OAUTH_CLIENT_ID 和 ${prefix}_OAUTH_CLIENT_SECRET`);
};

const getOAuthRedirectUri = (requestUrl: string) => {
  const requestOrigin = new URL(requestUrl).origin;
  const configuredBase = getEnvString("STORAGE_OAUTH_REDIRECT_BASE_URL", "APP_BASE_URL");
  const base = configuredBase || requestOrigin;
  const parsed = new URL(base);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("OAuth 回调地址配置无效");
  return new URL("/api/storage-oauth", `${parsed.origin}/`).toString();
};

export const createStorageOAuthAuthorizationUrl = async (
  provider: StorageOAuthProvider,
  ctx: AppAccessContext,
  requestUrl: string,
) => {
  const config = requireStorageOAuthConfig(provider);
  const redirectUri = getOAuthRedirectUri(requestUrl);
  const openerOrigin = new URL(requestUrl).origin;
  const state = await issueSealedPayload({
    kind: "storage-oauth-state",
    provider,
    userId: ctx.user.id,
    teamId: ctx.team.id,
    redirectUri,
    openerOrigin,
  } satisfies StorageOAuthState, 10 * 60);

  if (provider === "onedrive") {
    const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId || "common")}/oauth2/v2.0/authorize`);
    url.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: "offline_access Files.ReadWrite",
      prompt: "select_account",
      state,
    }).toString();
    return url.toString();
  }

  if (provider === "google_drive") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "https://www.googleapis.com/auth/drive",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent select_account",
      state,
    }).toString();
    return url.toString();
  }

  const url = new URL("https://www.dropbox.com/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    token_access_type: "offline",
    scope: "files.metadata.read files.metadata.write files.content.read files.content.write",
    state,
  }).toString();
  return url.toString();
};

const readTokenError = async (provider: StorageOAuthProvider, response: Response) => {
  const text = await response.text().catch(() => "");
  let detail = text.trim();
  try {
    const parsed = JSON.parse(detail) as { error_description?: unknown; error?: unknown };
    detail = String(parsed.error_description ?? parsed.error ?? detail).trim();
  } catch {
    // Keep the response text.
  }
  if (detail.length > 240) detail = `${detail.slice(0, 240)}…`;
  return `${providerName(provider)} 授权失败${detail ? `：${detail}` : ""}`;
};

export const readStorageOAuthCallbackState = async (stateToken: string): Promise<StorageOAuthCallbackState> => {
  const state = await readSealedPayload<StorageOAuthState>(stateToken);
  if (!state || state.kind !== "storage-oauth-state" || !isStorageOAuthProvider(state.provider)) {
    throw new Error("OAuth 授权状态无效，请重新登录");
  }
  return { provider: state.provider, openerOrigin: state.openerOrigin };
};

export const exchangeStorageOAuthCallback = async (input: {
  code: string;
  state: string;
}) => {
  const state = await readSealedPayload<StorageOAuthState>(input.state);
  if (!state || state.kind !== "storage-oauth-state" || !isStorageOAuthProvider(state.provider)) {
    throw new Error("OAuth 授权状态无效，请重新登录");
  }
  const config = requireStorageOAuthConfig(state.provider);
  const form = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    redirect_uri: state.redirectUri,
    grant_type: "authorization_code",
  });
  let tokenUrl = "";
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });

  if (state.provider === "onedrive") {
    tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId || "common")}/oauth2/v2.0/token`;
    form.set("scope", "offline_access Files.ReadWrite");
  } else if (state.provider === "google_drive") {
    tokenUrl = "https://oauth2.googleapis.com/token";
  } else {
    tokenUrl = "https://api.dropboxapi.com/oauth2/token";
  }

  const response = await fetch(tokenUrl, { method: "POST", headers, body: form });
  if (!response.ok) throw new Error(await readTokenError(state.provider, response));
  const tokens = await response.json() as { access_token?: unknown; refresh_token?: unknown };
  const accessToken = String(tokens.access_token ?? "").trim();
  const refreshToken = String(tokens.refresh_token ?? "").trim();
  if (!accessToken) throw new Error(`${providerName(state.provider)} 未返回访问令牌`);
  if (!refreshToken) throw new Error(`${providerName(state.provider)} 未返回长期刷新令牌，请撤销旧授权后重试`);

  const grantToken = await issueSealedPayload({
    kind: "storage-oauth-grant",
    provider: state.provider,
    userId: state.userId,
    teamId: state.teamId,
    accessToken,
    refreshToken,
    clientId: config.clientId,
    tenantId: state.provider === "onedrive" ? config.tenantId || "common" : undefined,
  } satisfies StorageOAuthGrant, 10 * 60);

  return {
    provider: state.provider,
    openerOrigin: state.openerOrigin,
    grantToken,
  };
};

export const redeemStorageOAuthGrant = async (
  ctx: AppAccessContext,
  input: UpsertBucketInput,
): Promise<UpsertBucketInput> => {
  const token = String(input.oauthGrantToken ?? "").trim();
  if (!token) return input;
  const grant = await readSealedPayload<StorageOAuthGrant>(token);
  if (!grant || grant.kind !== "storage-oauth-grant" || !isStorageOAuthProvider(grant.provider)) {
    throw new Error("云盘授权结果无效，请重新登录");
  }
  if (grant.userId !== ctx.user.id || grant.teamId !== ctx.team.id) {
    throw new Error("云盘授权结果与当前账号不匹配，请重新登录");
  }
  if (input.provider && input.provider !== grant.provider) {
    throw new Error("云盘授权平台不匹配，请重新登录");
  }
  return {
    ...input,
    provider: grant.provider,
    accessToken: grant.accessToken,
    refreshToken: grant.refreshToken,
    clientId: grant.clientId,
    clientSecret: undefined,
    tenantId: grant.tenantId ?? input.tenantId,
    oauthGrantToken: undefined,
  };
};
