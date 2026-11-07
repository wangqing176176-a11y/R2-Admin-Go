import { decryptCredential, encryptCredential } from "@/lib/crypto";
import { supabaseAdminRestFetch, readSupabaseRestArray } from "@/lib/supabase";
import type { RouteTokenCredentials } from "@/lib/route-token";
import type { AppAccessContext } from "@/lib/access-control";
import { getEnvString } from "@/lib/env";

type UserBucketRow = {
  id: string;
  team_id: string;
  user_id: string;
  bucket_label: string;
  bucket_name: string;
  account_id: string;
  access_key_id_enc: string;
  secret_access_key_enc: string;
  public_base_url: string | null;
  custom_base_url: string | null;
  transfer_mode_override: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type BucketTransferMode = "presigned" | "proxy" | "presigned_needs_bucket_name";
export type StorageProvider = NonNullable<RouteTokenCredentials["provider"]>;

type StoredPublicConfig = {
  provider: StorageProvider;
  accountId?: string;
  endpoint?: string;
  region?: string;
  pathStyle?: boolean;
  rootPath?: string;
  username?: string;
  tenantId?: string;
  driveId?: string;
};

type StoredSecretConfig = {
  accessKeyId?: string;
  secretAccessKey?: string;
  password?: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
};

export type UserBucketView = {
  id: string;
  Name: string;
  CreationDate: string;
  transferMode: BucketTransferMode;
  bucketLabel: string;
  bucketName: string;
  accountId: string;
  provider: StorageProvider;
  providerLabel: string;
  endpoint?: string;
  region?: string;
  rootPath?: string;
  username?: string;
  tenantId?: string;
  driveId?: string;
  pathStyle?: boolean;
  supportsMultipart: boolean;
  isDefault: boolean;
  publicBaseUrl?: string;
  customBaseUrl?: string;
};

export type UserBucketDetail = RouteTokenCredentials & {
  id: string;
  teamId: string;
  userId: string;
  bucketLabel: string;
  publicBaseUrl?: string;
  customBaseUrl?: string;
  transferModeOverride?: "auto" | "presigned" | "proxy";
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UpsertBucketInput = {
  provider?: StorageProvider;
  bucketLabel?: string;
  bucketName?: string;
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  region?: string;
  pathStyle?: boolean;
  rootPath?: string;
  username?: string;
  password?: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  driveId?: string;
  oauthGrantToken?: string;
  publicBaseUrl?: string;
  customBaseUrl?: string;
  transferModeOverride?: "auto" | "presigned" | "proxy";
  isDefault?: boolean;
};

const SELECT_COLUMNS =
  "id,team_id,user_id,bucket_label,bucket_name,account_id,access_key_id_enc,secret_access_key_enc,public_base_url,custom_base_url,transfer_mode_override,is_default,created_at,updated_at";

const encodeFilter = (value: string) => encodeURIComponent(value);

const normalizeBaseUrl = (raw?: string | null) => {
  const t = String(raw ?? "").trim();
  if (!t) return undefined;
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  return withProto.endsWith("/") ? withProto : `${withProto}/`;
};

const normalizeBucketName = (raw?: string | null) => String(raw ?? "").trim();
const normalizeLabel = (label?: string | null, bucketName?: string | null) => {
  const t = String(label ?? "").trim();
  if (t) return t;
  return String(bucketName ?? "").trim();
};

const validateBucketName = (bucketName: string) => /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/i.test(bucketName);

const STORAGE_CONFIG_PREFIX = "storage:v1:";
const STORAGE_PROVIDERS = new Set<StorageProvider>([
  "cloudflare_r2", "aws_s3", "custom_s3", "webdav", "onedrive", "google_drive", "dropbox",
]);

export const STORAGE_PROVIDER_LABELS: Record<StorageProvider, string> = {
  cloudflare_r2: "Cloudflare R2",
  aws_s3: "AWS S3",
  custom_s3: "自定义 S3",
  webdav: "WebDAV 服务器",
  onedrive: "OneDrive",
  google_drive: "Google Drive",
  dropbox: "Dropbox",
};

const encodeConfig = (config: StoredPublicConfig) => {
  const bytes = new TextEncoder().encode(JSON.stringify(config));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `${STORAGE_CONFIG_PREFIX}${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
};

const decodeConfig = (accountId: string): StoredPublicConfig => {
  if (!accountId.startsWith(STORAGE_CONFIG_PREFIX)) return { provider: "cloudflare_r2", accountId };
  try {
    const encoded = accountId.slice(STORAGE_CONFIG_PREFIX.length).replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(encoded + "=".repeat((4 - encoded.length % 4) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as StoredPublicConfig;
    if (!STORAGE_PROVIDERS.has(parsed.provider)) throw new Error("unsupported provider");
    return parsed;
  } catch {
    return { provider: "cloudflare_r2", accountId };
  }
};

const parseStoredSecrets = (raw: string, legacySecret: string): StoredSecretConfig => {
  try {
    const parsed = JSON.parse(raw) as StoredSecretConfig;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // Legacy R2 rows store the access key and secret separately.
  }
  return { accessKeyId: raw, secretAccessKey: legacySecret };
};

export const credentialsFromStoredBucketRow = async (row: Pick<UserBucketRow, "bucket_name" | "account_id" | "access_key_id_enc" | "secret_access_key_enc">): Promise<RouteTokenCredentials> => {
  const [storedSecretRaw, legacySecretAccessKey] = await Promise.all([
    decryptCredential(row.access_key_id_enc),
    decryptCredential(row.secret_access_key_enc),
  ]);
  const config = decodeConfig(row.account_id);
  const secrets = parseStoredSecrets(storedSecretRaw, legacySecretAccessKey);
  return {
    provider: config.provider,
    bucketName: row.bucket_name,
    accountId: config.accountId ?? "",
    accessKeyId: secrets.accessKeyId ?? "",
    secretAccessKey: secrets.secretAccessKey ?? "",
    endpoint: config.endpoint,
    region: config.region,
    pathStyle: config.pathStyle,
    rootPath: config.rootPath,
    username: config.username,
    password: secrets.password,
    accessToken: secrets.accessToken,
    refreshToken: secrets.refreshToken,
    clientId: secrets.clientId,
    clientSecret: secrets.clientSecret,
    tenantId: config.tenantId,
    driveId: config.driveId,
  };
};

const getStoredBucketName = (provider: StorageProvider, input: UpsertBucketInput) => {
  if (provider === "cloudflare_r2" || provider === "aws_s3" || provider === "custom_s3") {
    return normalizeBucketName(input.bucketName);
  }
  return String(input.rootPath ?? "").trim() || "root";
};

const validateConnectionInput = (provider: StorageProvider, input: UpsertBucketInput, isEditing = false) => {
  const bucketName = getStoredBucketName(provider, input);
  const requiredSecret = (value: unknown) => isEditing || Boolean(String(value ?? "").trim());
  if ((provider === "cloudflare_r2" || provider === "aws_s3" || provider === "custom_s3") && !bucketName) {
    throw new Error("桶名称不能为空");
  }
  if (provider === "cloudflare_r2" && !validateBucketName(bucketName)) throw new Error("R2 桶名称格式不正确");
  if (provider === "cloudflare_r2" && !String(input.accountId ?? "").trim()) throw new Error("Cloudflare 账户 ID 不能为空");
  if (provider === "custom_s3" && !String(input.endpoint ?? "").trim()) throw new Error("S3 Endpoint 不能为空");
  if ((provider === "cloudflare_r2" || provider === "aws_s3" || provider === "custom_s3") && !requiredSecret(input.accessKeyId)) {
    throw new Error("访问密钥 ID 不能为空");
  }
  if ((provider === "cloudflare_r2" || provider === "aws_s3" || provider === "custom_s3") && !requiredSecret(input.secretAccessKey)) {
    throw new Error("机密访问密钥不能为空");
  }
  if (provider === "webdav") {
    if (!String(input.endpoint ?? "").trim()) throw new Error("WebDAV 地址不能为空");
    if (!String(input.username ?? "").trim()) throw new Error("WebDAV 用户名不能为空");
    if (!requiredSecret(input.password)) throw new Error("WebDAV 密码不能为空");
  }
  if ((provider === "onedrive" || provider === "google_drive" || provider === "dropbox") && !isEditing) {
    const hasAccessToken = Boolean(String(input.accessToken ?? "").trim());
    const hasRefresh = Boolean(String(input.refreshToken ?? "").trim() && String(input.clientId ?? "").trim());
    if (!hasAccessToken && !hasRefresh) throw new Error("请填写访问令牌，或填写刷新令牌和 Client ID");
  }
  return bucketName;
};

const rowToView = (row: UserBucketRow): UserBucketView => {
  const config = decodeConfig(row.account_id);
  const isS3 = config.provider === "cloudflare_r2" || config.provider === "aws_s3" || config.provider === "custom_s3";
  return {
    id: row.id,
    Name: row.bucket_label || row.bucket_name,
    CreationDate: row.created_at,
    transferMode: isS3 ? "presigned" : "proxy",
    bucketLabel: row.bucket_label || row.bucket_name,
    bucketName: row.bucket_name,
    accountId: config.accountId ?? "",
    provider: config.provider,
    providerLabel: STORAGE_PROVIDER_LABELS[config.provider],
    endpoint: config.endpoint,
    region: config.region,
    rootPath: config.rootPath,
    username: config.username,
    tenantId: config.tenantId,
    driveId: config.driveId,
    pathStyle: config.pathStyle,
    supportsMultipart: isS3,
    isDefault: Boolean(row.is_default),
    publicBaseUrl: normalizeBaseUrl(row.public_base_url),
    customBaseUrl: normalizeBaseUrl(row.custom_base_url),
  };
};

const readRows = async (pathWithQuery: string, fallback: string) => {
  const res = await supabaseAdminRestFetch(pathWithQuery, { method: "GET" });
  return await readSupabaseRestArray<UserBucketRow>(res, fallback);
};

const teamFilter = (ctx: AppAccessContext) => `team_id=eq.${encodeFilter(ctx.team.id)}`;

const configuredBucketDetailCacheTtlMs = Number(getEnvString("USER_BUCKET_DETAIL_CACHE_TTL_MS") ?? NaN);
const USER_BUCKET_DETAIL_CACHE_TTL_MS = Number.isFinite(configuredBucketDetailCacheTtlMs)
  ? Math.max(5_000, Math.min(10 * 60_000, configuredBucketDetailCacheTtlMs))
  : 15_000;
const USER_BUCKET_DETAIL_CACHE_MAX = 256;

type UserBucketDetailCacheStore = {
  ok: Map<string, { detail: UserBucketDetail; untilMs: number }>;
  inflight: Map<string, Promise<UserBucketDetail>>;
};

const USER_BUCKET_DETAIL_CACHE_SYM = Symbol.for("__r2_user_bucket_detail_cache_v1__");

const getUserBucketDetailCacheStore = (): UserBucketDetailCacheStore => {
  const g = globalThis as unknown as Record<symbol, unknown>;
  const existing = g[USER_BUCKET_DETAIL_CACHE_SYM] as UserBucketDetailCacheStore | undefined;
  if (existing) return existing;
  const created: UserBucketDetailCacheStore = {
    ok: new Map(),
    inflight: new Map(),
  };
  g[USER_BUCKET_DETAIL_CACHE_SYM] = created;
  return created;
};

const bucketDetailCacheKey = (teamId: string, bucketId: string) => `${teamId}::${bucketId}`;

const pruneUserBucketDetailCache = (store: UserBucketDetailCacheStore, nowMs: number) => {
  for (const [key, entry] of store.ok.entries()) {
    if (entry.untilMs <= nowMs) store.ok.delete(key);
  }
  while (store.ok.size > USER_BUCKET_DETAIL_CACHE_MAX) {
    const first = store.ok.keys().next();
    if (first.done) break;
    store.ok.delete(first.value);
  }
};

const invalidateUserBucketDetailCacheByBucket = (teamId: string, bucketId: string) => {
  const store = getUserBucketDetailCacheStore();
  const key = bucketDetailCacheKey(teamId, bucketId);
  store.ok.delete(key);
  store.inflight.delete(key);
};

const invalidateUserBucketDetailCacheByTeam = (teamId: string) => {
  const store = getUserBucketDetailCacheStore();
  const prefix = `${teamId}::`;
  for (const key of store.ok.keys()) {
    if (key.startsWith(prefix)) store.ok.delete(key);
  }
  for (const key of store.inflight.keys()) {
    if (key.startsWith(prefix)) store.inflight.delete(key);
  }
};

const setDefaultBucketInternal = async (ctx: AppAccessContext, bucketId: string) => {
  await supabaseAdminRestFetch(`user_r2_buckets?${teamFilter(ctx)}&is_default=eq.true`, {
    method: "PATCH",
    body: { is_default: false },
  });

  const res = await supabaseAdminRestFetch(`user_r2_buckets?${teamFilter(ctx)}&id=eq.${encodeFilter(bucketId)}`, {
    method: "PATCH",
    body: { is_default: true },
    prefer: "return=minimal",
  });
  if (!res.ok) throw new Error("设置默认存储桶失败");
  invalidateUserBucketDetailCacheByTeam(ctx.team.id);
};

const ensureDefaultBucketExists = async (ctx: AppAccessContext) => {
  const currentDefault = await readRows(
    `user_r2_buckets?select=id&${teamFilter(ctx)}&is_default=eq.true&limit=1`,
    "读取默认存储桶失败",
  );
  if (currentDefault.length > 0) return;

  const first = await readRows(
    `user_r2_buckets?select=id&${teamFilter(ctx)}&order=created_at.asc&limit=1`,
    "读取存储桶列表失败",
  );
  if (first[0]?.id) {
    await setDefaultBucketInternal(ctx, String(first[0].id));
  }
};

export const listUserBucketViews = async (ctx: AppAccessContext) => {
  const rows = await readRows(
    `user_r2_buckets?select=${SELECT_COLUMNS}&${teamFilter(ctx)}&order=is_default.desc,created_at.asc`,
    "读取存储桶列表失败",
  );
  return rows.map(rowToView);
};

export const getUserBucketDetail = async (ctx: AppAccessContext, bucketId: string): Promise<UserBucketDetail> => {
  const cacheKey = bucketDetailCacheKey(ctx.team.id, bucketId);
  const nowMs = Date.now();
  const store = getUserBucketDetailCacheStore();
  pruneUserBucketDetailCache(store, nowMs);

  const cached = store.ok.get(cacheKey);
  if (cached && cached.untilMs > nowMs) return cached.detail;
  if (cached) store.ok.delete(cacheKey);

  const pending = store.inflight.get(cacheKey);
  if (pending) return await pending;

  const buildPromise = (async () => {
    const rows = await readRows(
      `user_r2_buckets?select=${SELECT_COLUMNS}&${teamFilter(ctx)}&id=eq.${encodeFilter(bucketId)}&limit=1`,
      "读取存储桶信息失败",
    );
    const row = rows[0];
    if (!row) throw new Error("未找到存储桶");

    const [storedSecretRaw, legacySecretAccessKey] = await Promise.all([
      decryptCredential(row.access_key_id_enc),
      decryptCredential(row.secret_access_key_enc),
    ]);
    const publicConfig = decodeConfig(row.account_id);
    const secrets = parseStoredSecrets(storedSecretRaw, legacySecretAccessKey);

    const detail: UserBucketDetail = {
      id: row.id,
      teamId: row.team_id,
      userId: row.user_id,
      bucketLabel: row.bucket_label || row.bucket_name,
      bucketName: row.bucket_name,
      provider: publicConfig.provider,
      accountId: publicConfig.accountId ?? "",
      accessKeyId: secrets.accessKeyId ?? "",
      secretAccessKey: secrets.secretAccessKey ?? "",
      endpoint: publicConfig.endpoint,
      region: publicConfig.region,
      pathStyle: publicConfig.pathStyle,
      rootPath: publicConfig.rootPath,
      username: publicConfig.username,
      password: secrets.password,
      accessToken: secrets.accessToken,
      refreshToken: secrets.refreshToken,
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret,
      tenantId: publicConfig.tenantId,
      driveId: publicConfig.driveId,
      publicBaseUrl: normalizeBaseUrl(row.public_base_url),
      customBaseUrl: normalizeBaseUrl(row.custom_base_url),
      transferModeOverride:
        row.transfer_mode_override === "auto" || row.transfer_mode_override === "presigned" || row.transfer_mode_override === "proxy"
          ? row.transfer_mode_override
          : undefined,
      isDefault: Boolean(row.is_default),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    store.ok.set(cacheKey, { detail, untilMs: Date.now() + USER_BUCKET_DETAIL_CACHE_TTL_MS });
    pruneUserBucketDetailCache(store, Date.now());
    return detail;
  })().finally(() => {
    store.inflight.delete(cacheKey);
  });

  store.inflight.set(cacheKey, buildPromise);
  return await buildPromise;
};

export const resolveBucketCredentials = async (
  ctx: AppAccessContext,
  bucketId: string,
): Promise<{ detail: UserBucketDetail; creds: RouteTokenCredentials }> => {
  const detail = await getUserBucketDetail(ctx, bucketId);
  return {
    detail,
    creds: {
      provider: detail.provider,
      accountId: detail.accountId,
      accessKeyId: detail.accessKeyId,
      secretAccessKey: detail.secretAccessKey,
      bucketName: detail.bucketName,
      endpoint: detail.endpoint,
      region: detail.region,
      pathStyle: detail.pathStyle,
      rootPath: detail.rootPath,
      username: detail.username,
      password: detail.password,
      accessToken: detail.accessToken,
      refreshToken: detail.refreshToken,
      clientId: detail.clientId,
      clientSecret: detail.clientSecret,
      tenantId: detail.tenantId,
      driveId: detail.driveId,
    },
  };
};

const normalizeProvider = (value: unknown): StorageProvider => {
  const provider = String(value ?? "cloudflare_r2") as StorageProvider;
  if (!STORAGE_PROVIDERS.has(provider)) throw new Error("不支持的存储平台");
  return provider;
};

const buildStoredConfigs = (provider: StorageProvider, input: UpsertBucketInput, previous?: UserBucketDetail) => {
  const pick = (value: unknown, fallback?: string) => String(value ?? "").trim() || fallback || undefined;
  const publicConfig: StoredPublicConfig = {
    provider,
    accountId: provider === "cloudflare_r2" ? pick(input.accountId, previous?.accountId) : undefined,
    endpoint: provider === "custom_s3" || provider === "webdav" ? pick(input.endpoint, previous?.endpoint) : undefined,
    region: provider === "aws_s3" || provider === "custom_s3" ? pick(input.region, previous?.region) || "us-east-1" : undefined,
    pathStyle: provider === "custom_s3" ? input.pathStyle ?? previous?.pathStyle ?? true : undefined,
    rootPath: provider === "webdav" || provider === "onedrive" || provider === "google_drive" || provider === "dropbox"
      ? pick(input.rootPath, previous?.rootPath)
      : undefined,
    username: provider === "webdav" ? pick(input.username, previous?.username) : undefined,
    tenantId: provider === "onedrive" ? pick(input.tenantId, previous?.tenantId) || "common" : undefined,
    driveId: provider === "onedrive" || provider === "google_drive" ? pick(input.driveId, previous?.driveId) : undefined,
  };
  const secretConfig: StoredSecretConfig = {
    accessKeyId: provider === "cloudflare_r2" || provider === "aws_s3" || provider === "custom_s3"
      ? pick(input.accessKeyId, previous?.accessKeyId)
      : undefined,
    secretAccessKey: provider === "cloudflare_r2" || provider === "aws_s3" || provider === "custom_s3"
      ? pick(input.secretAccessKey, previous?.secretAccessKey)
      : undefined,
    password: provider === "webdav" ? pick(input.password, previous?.password) : undefined,
    accessToken: provider === "onedrive" || provider === "google_drive" || provider === "dropbox"
      ? pick(input.accessToken, previous?.accessToken)
      : undefined,
    refreshToken: provider === "onedrive" || provider === "google_drive" || provider === "dropbox"
      ? pick(input.refreshToken, previous?.refreshToken)
      : undefined,
    clientId: provider === "onedrive" || provider === "google_drive" || provider === "dropbox"
      ? pick(input.clientId, previous?.clientId)
      : undefined,
    clientSecret: provider === "onedrive" || provider === "google_drive" || provider === "dropbox"
      ? pick(input.clientSecret, previous?.clientSecret)
      : undefined,
  };
  return { publicConfig, secretConfig };
};

export const createUserBucket = async (ctx: AppAccessContext, input: UpsertBucketInput): Promise<UserBucketView> => {
  const provider = normalizeProvider(input.provider);
  const bucketName = validateConnectionInput(provider, input, false);
  const bucketLabel = normalizeLabel(input.bucketLabel, provider === "cloudflare_r2" || provider === "aws_s3" || provider === "custom_s3"
    ? bucketName
    : STORAGE_PROVIDER_LABELS[provider]);
  const { publicConfig, secretConfig } = buildStoredConfigs(provider, input);
  const storedAccountId = encodeConfig(publicConfig);

  const candidates = await readRows(
    `user_r2_buckets?select=${SELECT_COLUMNS}&${teamFilter(ctx)}&bucket_name=eq.${encodeFilter(bucketName)}&limit=50`,
    "校验存储桶是否已存在失败",
  );
  const existing = candidates.find((row) => row.account_id === storedAccountId
    || (provider === "cloudflare_r2" && !row.account_id.startsWith(STORAGE_CONFIG_PREFIX) && row.account_id === publicConfig.accountId));
  if (existing?.id) {
    return await updateUserBucket(ctx, existing.id, {
      ...input,
      provider,
      bucketName,
    });
  }

  const payload = {
    team_id: ctx.team.id,
    user_id: ctx.user.id,
    bucket_label: bucketLabel,
    bucket_name: bucketName,
    account_id: storedAccountId,
    access_key_id_enc: await encryptCredential(JSON.stringify(secretConfig)),
    secret_access_key_enc: await encryptCredential(""),
    public_base_url: normalizeBaseUrl(input.publicBaseUrl) ?? null,
    custom_base_url: normalizeBaseUrl(input.customBaseUrl) ?? null,
    transfer_mode_override:
      input.transferModeOverride === "auto" || input.transferModeOverride === "presigned" || input.transferModeOverride === "proxy"
        ? input.transferModeOverride
        : null,
    is_default: Boolean(input.isDefault),
  };

  const res = await supabaseAdminRestFetch("user_r2_buckets", {
    method: "POST",
    body: payload,
    prefer: "return=representation",
  });

  const rows = await readSupabaseRestArray<UserBucketRow>(res, "新增存储桶失败");
  const created = rows[0];
  if (!created?.id) throw new Error("新增存储桶失败");

  if (payload.is_default) {
    await setDefaultBucketInternal(ctx, created.id);
  } else {
    await ensureDefaultBucketExists(ctx);
  }

  invalidateUserBucketDetailCacheByTeam(ctx.team.id);

  return rowToView(created);
};

export const updateUserBucket = async (
  ctx: AppAccessContext,
  bucketId: string,
  input: UpsertBucketInput,
): Promise<UserBucketView> => {
  const previous = await getUserBucketDetail(ctx, bucketId);
  const provider = normalizeProvider(input.provider ?? previous.provider);
  const mergedInput: UpsertBucketInput = {
    ...input,
    provider,
    bucketName: input.bucketName ?? previous.bucketName,
    accountId: input.accountId ?? previous.accountId,
    endpoint: input.endpoint ?? previous.endpoint,
    region: input.region ?? previous.region,
    pathStyle: input.pathStyle ?? previous.pathStyle,
    rootPath: input.rootPath ?? previous.rootPath,
    username: input.username ?? previous.username,
    tenantId: input.tenantId ?? previous.tenantId,
    driveId: input.driveId ?? previous.driveId,
  };
  const bucketName = validateConnectionInput(provider, mergedInput, true);
  const { publicConfig, secretConfig } = buildStoredConfigs(provider, mergedInput, previous);
  const patch: Record<string, unknown> = {
    bucket_name: bucketName,
    account_id: encodeConfig(publicConfig),
    access_key_id_enc: await encryptCredential(JSON.stringify(secretConfig)),
    secret_access_key_enc: await encryptCredential(""),
  };

  if (input.bucketLabel !== undefined) {
    const label = String(input.bucketLabel ?? "").trim();
    if (label) patch.bucket_label = label;
  }

  if (input.publicBaseUrl !== undefined) patch.public_base_url = normalizeBaseUrl(input.publicBaseUrl) ?? null;
  if (input.customBaseUrl !== undefined) patch.custom_base_url = normalizeBaseUrl(input.customBaseUrl) ?? null;

  if (input.transferModeOverride !== undefined) {
    patch.transfer_mode_override =
      input.transferModeOverride === "auto" || input.transferModeOverride === "presigned" || input.transferModeOverride === "proxy"
        ? input.transferModeOverride
        : null;
  }

  if (Object.keys(patch).length > 0) {
    invalidateUserBucketDetailCacheByBucket(ctx.team.id, bucketId);
    const res = await supabaseAdminRestFetch(`user_r2_buckets?${teamFilter(ctx)}&id=eq.${encodeFilter(bucketId)}`, {
      method: "PATCH",
      body: patch,
      prefer: "return=representation",
    });

    const rows = await readSupabaseRestArray<UserBucketRow>(res, "更新存储桶失败");
    if (!rows[0]?.id) throw new Error("未找到存储桶");
  }

  if (input.isDefault === true) {
    await setDefaultBucketInternal(ctx, bucketId);
  }

  invalidateUserBucketDetailCacheByBucket(ctx.team.id, bucketId);

  const rows = await readRows(
    `user_r2_buckets?select=${SELECT_COLUMNS}&${teamFilter(ctx)}&id=eq.${encodeFilter(bucketId)}&limit=1`,
    "刷新存储桶信息失败",
  );
  const row = rows[0];
  if (!row) throw new Error("未找到存储桶");
  return rowToView(row);
};

export const deleteUserBucket = async (ctx: AppAccessContext, bucketId: string) => {
  invalidateUserBucketDetailCacheByBucket(ctx.team.id, bucketId);
  const res = await supabaseAdminRestFetch(`user_r2_buckets?${teamFilter(ctx)}&id=eq.${encodeFilter(bucketId)}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "删除存储桶失败");
  }
  await ensureDefaultBucketExists(ctx);
  invalidateUserBucketDetailCacheByTeam(ctx.team.id);
};

export const setDefaultBucket = async (ctx: AppAccessContext, bucketId: string) => {
  await setDefaultBucketInternal(ctx, bucketId);
};
