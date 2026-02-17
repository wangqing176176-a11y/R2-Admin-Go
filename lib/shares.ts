import { decryptCredential } from "@/lib/crypto";
import { requireEnvString } from "@/lib/env";
import { createR2Bucket, type R2ClientCredentials } from "@/lib/r2-s3";
import { type RouteTokenCredentials, issueRouteToken } from "@/lib/route-token";
import { createPasscodeSalt, createShareCode, hashPasscode, normalizePasscode, normalizeShareCode, validatePasscode, verifyPasscodeHash } from "@/lib/share-security";
import { readSupabaseRestArray, supabaseRestFetch } from "@/lib/supabase";
import { resolveBucketCredentials } from "@/lib/user-buckets";

export type ShareItemType = "file" | "folder";
export type ShareStatus = "active" | "expired" | "stopped";

type ShareRow = {
  id: string;
  user_id: string;
  bucket_id: string;
  share_code: string;
  item_type: ShareItemType;
  item_key: string;
  item_name: string;
  note: string | null;
  passcode_enabled: boolean;
  passcode_salt: string | null;
  passcode_hash: string | null;
  expires_at: string | null;
  is_active: boolean;
  access_count: number | string | null;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
};

type BucketRowForShare = {
  id: string;
  user_id: string;
  bucket_name: string;
  account_id: string;
  access_key_id_enc: string;
  secret_access_key_enc: string;
};

export type ShareView = {
  id: string;
  shareCode: string;
  bucketId: string;
  itemType: ShareItemType;
  itemKey: string;
  itemName: string;
  note?: string;
  passcodeEnabled: boolean;
  expiresAt?: string;
  isActive: boolean;
  status: ShareStatus;
  accessCount: number;
  lastAccessedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ShareCreateInput = {
  bucketId: string;
  itemType: ShareItemType;
  itemKey: string;
  itemName?: string;
  expireDays?: 0 | 1 | 7 | 30;
  passcode?: string;
  note?: string;
};

export type PublicShareMeta = {
  id: string;
  shareCode: string;
  itemType: ShareItemType;
  itemKey: string;
  itemName: string;
  note?: string;
  passcodeEnabled: boolean;
  expiresAt?: string;
  isActive: boolean;
  status: ShareStatus;
  downloadName: string;
};

const SELECT_COLUMNS =
  "id,user_id,bucket_id,share_code,item_type,item_key,item_name,note,passcode_enabled,passcode_salt,passcode_hash,expires_at,is_active,access_count,last_accessed_at,created_at,updated_at";
const STOPPED_SHARE_RETENTION_DAYS = 7;

const encodeFilter = (value: string) => encodeURIComponent(value);

const getSupabaseUrl = () => requireEnvString("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL").replace(/\/$/, "");

const getSupabaseServiceRoleKey = () => requireEnvString("SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdminRestFetch = async (
  pathWithQuery: string,
  opts: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    prefer?: string;
  } = {},
) => {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const method = opts.method ?? "GET";

  const headers = new Headers();
  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", `Bearer ${serviceRoleKey}`);
  if (opts.body !== undefined) headers.set("Content-Type", "application/json");
  if (opts.prefer) headers.set("Prefer", opts.prefer);

  return await fetch(`${url}/rest/v1/${pathWithQuery}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
};

const normalizeItemKey = (itemType: ShareItemType, raw: string) => {
  let key = String(raw ?? "").trim();
  while (key.startsWith("/")) key = key.slice(1);
  if (!key) throw new Error("分享对象路径不能为空");
  if (itemType === "folder") {
    if (!key.endsWith("/")) key += "/";
  } else if (key.endsWith("/")) {
    throw new Error("文件分享路径格式不正确");
  }
  return key;
};

const normalizeItemName = (itemType: ShareItemType, key: string, raw?: string) => {
  const manual = String(raw ?? "").trim();
  if (manual) return manual.slice(0, 180);
  if (itemType === "folder") {
    const segs = key.split("/").filter(Boolean);
    return (segs[segs.length - 1] || "文件夹").slice(0, 180);
  }
  return (key.split("/").pop() || "文件").slice(0, 180);
};

const normalizeExpireDays = (raw: unknown): 0 | 1 | 7 | 30 => {
  const n = Number(raw);
  if (n === 1 || n === 7 || n === 30) return n;
  return 0;
};

const normalizeNote = (raw: unknown) => {
  const note = String(raw ?? "").trim();
  if (!note) return null;
  return note.slice(0, 120);
};

const nowMs = () => Date.now();

const isExpiredBy = (expiresAt: string | null | undefined, tMs: number) => {
  if (!expiresAt) return false;
  const ts = Date.parse(expiresAt);
  return Number.isFinite(ts) && ts <= tMs;
};

const toShareStatus = (row: ShareRow): ShareStatus => {
  if (!row.is_active) return "stopped";
  if (isExpiredBy(row.expires_at, nowMs())) return "expired";
  return "active";
};

const toShareView = (row: ShareRow): ShareView => ({
  id: row.id,
  shareCode: row.share_code,
  bucketId: row.bucket_id,
  itemType: row.item_type,
  itemKey: row.item_key,
  itemName: row.item_name,
  note: row.note ?? undefined,
  passcodeEnabled: Boolean(row.passcode_enabled),
  expiresAt: row.expires_at ?? undefined,
  isActive: Boolean(row.is_active),
  status: toShareStatus(row),
  accessCount: Number(row.access_count ?? 0) || 0,
  lastAccessedAt: row.last_accessed_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toPublicMeta = (row: ShareRow): PublicShareMeta => ({
  id: row.id,
  shareCode: row.share_code,
  itemType: row.item_type,
  itemKey: row.item_key,
  itemName: row.item_name,
  note: row.note ?? undefined,
  passcodeEnabled: Boolean(row.passcode_enabled),
  expiresAt: row.expires_at ?? undefined,
  isActive: Boolean(row.is_active),
  status: toShareStatus(row),
  downloadName: row.item_type === "folder" ? "" : row.item_name || row.item_key.split("/").pop() || "download",
});

const ensureShareActive = (row: ShareRow) => {
  if (!row.is_active) throw new Error("该分享已停止");
  if (isExpiredBy(row.expires_at, nowMs())) throw new Error("该分享已过期");
};

const readShareRowsByQuery = async (pathWithQuery: string) => {
  const res = await supabaseAdminRestFetch(pathWithQuery, { method: "GET" });
  return await readSupabaseRestArray<ShareRow>(res, "读取分享信息失败");
};

const getStoppedShareDeleteCutoff = (days = STOPPED_SHARE_RETENTION_DAYS) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const buildStoppedShareCleanupQuery = (cutoffIso: string) =>
  `user_r2_shares?is_active=eq.false&updated_at=lt.${encodeFilter(cutoffIso)}`;

const purgeStoppedSharesByUser = async (token: string) => {
  try {
    const cutoffIso = getStoppedShareDeleteCutoff();
    const res = await supabaseRestFetch(buildStoppedShareCleanupQuery(cutoffIso), {
      token,
      method: "DELETE",
      prefer: "return=minimal",
    });
    if (!res.ok) return;
  } catch {
    // Best effort only.
  }
};

const purgeStoppedSharesByAdmin = async () => {
  try {
    const cutoffIso = getStoppedShareDeleteCutoff();
    const res = await supabaseAdminRestFetch(buildStoppedShareCleanupQuery(cutoffIso), {
      method: "DELETE",
      prefer: "return=minimal",
    });
    if (!res.ok) return;
  } catch {
    // Best effort only.
  }
};

const resolveShareBucketCredentials = async (row: ShareRow): Promise<RouteTokenCredentials> => {
  const res = await supabaseAdminRestFetch(
    `user_r2_buckets?select=id,user_id,bucket_name,account_id,access_key_id_enc,secret_access_key_enc&id=eq.${encodeFilter(
      row.bucket_id,
    )}&user_id=eq.${encodeFilter(row.user_id)}&limit=1`,
    { method: "GET" },
  );
  const buckets = await readSupabaseRestArray<BucketRowForShare>(res, "读取分享桶信息失败");
  const bucket = buckets[0];
  if (!bucket?.id) throw new Error("分享对应的存储桶不存在或已被删除");

  return {
    accountId: bucket.account_id,
    accessKeyId: await decryptCredential(bucket.access_key_id_enc),
    secretAccessKey: await decryptCredential(bucket.secret_access_key_enc),
    bucketName: bucket.bucket_name,
  };
};

const resolveShareCodeCollision = async (payload: Record<string, unknown>, token: string) => {
  for (let i = 0; i < 5; i += 1) {
    const nextPayload = { ...payload, share_code: createShareCode(10) };
    const res = await supabaseRestFetch("user_r2_shares", {
      token,
      method: "POST",
      body: nextPayload,
      prefer: "return=representation",
    });

    if (res.ok) {
      const rows = await readSupabaseRestArray<ShareRow>(res, "创建分享失败");
      if (rows[0]?.id) return rows[0];
      throw new Error("创建分享失败");
    }

    const text = await res.text().catch(() => "");
    if (!/duplicate key/i.test(text)) {
      throw new Error(text || "创建分享失败");
    }
  }
  throw new Error("生成分享链接失败，请稍后重试");
};

export const createUserShare = async (token: string, userId: string, input: ShareCreateInput): Promise<ShareView> => {
  const ownerId = String(userId ?? "").trim();
  if (!ownerId) throw new Error("登录状态已失效，请重新登录。");
  const itemType: ShareItemType = input.itemType === "folder" ? "folder" : "file";
  const bucketId = String(input.bucketId ?? "").trim();
  if (!bucketId) throw new Error("缺少存储桶参数");

  const itemKey = normalizeItemKey(itemType, input.itemKey);
  const itemName = normalizeItemName(itemType, itemKey, input.itemName);
  const expireDays = normalizeExpireDays(input.expireDays);
  const note = normalizeNote(input.note);

  const passcodeRaw = normalizePasscode(input.passcode ?? "");
  const passcodeEnabled = passcodeRaw.length > 0;
  let passcodeSalt: string | null = null;
  let passcodeHash: string | null = null;
  if (passcodeEnabled) {
    const check = validatePasscode(passcodeRaw);
    if (!check.ok) throw new Error(check.message);
    passcodeSalt = createPasscodeSalt();
    passcodeHash = await hashPasscode(check.passcode, passcodeSalt);
  }

  const { creds } = await resolveBucketCredentials(token, bucketId);
  const bucket = createR2Bucket(creds);

  if (itemType === "file") {
    const head = await bucket.head(itemKey);
    if (!head) throw new Error("分享文件不存在或已被删除");
  } else {
    const list = await bucket.list({ prefix: itemKey, limit: 1 });
    const marker = await bucket.head(itemKey);
    const hasObjects = Array.isArray(list.objects) && list.objects.length > 0;
    const hasFolders = Array.isArray(list.delimitedPrefixes) && list.delimitedPrefixes.length > 0;
    if (!hasObjects && !hasFolders && !marker) {
      throw new Error("分享文件夹不存在或为空，请先上传文件后再分享");
    }
  }

  const expiresAt = expireDays > 0 ? new Date(Date.now() + expireDays * 24 * 3600 * 1000).toISOString() : null;

  const payload: Record<string, unknown> = {
    user_id: ownerId,
    bucket_id: bucketId,
    item_type: itemType,
    item_key: itemKey,
    item_name: itemName,
    note,
    passcode_enabled: passcodeEnabled,
    passcode_salt: passcodeSalt,
    passcode_hash: passcodeHash,
    expires_at: expiresAt,
    is_active: true,
    share_code: createShareCode(10),
  };

  const created = await resolveShareCodeCollision(payload, token);
  return toShareView(created);
};

export const listUserShares = async (token: string): Promise<ShareView[]> => {
  await purgeStoppedSharesByUser(token);
  const res = await supabaseRestFetch(`user_r2_shares?select=${SELECT_COLUMNS}&order=created_at.desc`, {
    token,
    method: "GET",
  });
  const rows = await readSupabaseRestArray<ShareRow>(res, "读取分享列表失败");
  return rows.map(toShareView);
};

export const stopUserShare = async (token: string, shareId: string): Promise<ShareView> => {
  const id = String(shareId ?? "").trim();
  if (!id) throw new Error("缺少分享 ID");

  const res = await supabaseRestFetch(`user_r2_shares?id=eq.${encodeFilter(id)}`, {
    token,
    method: "PATCH",
    body: { is_active: false },
    prefer: "return=representation",
  });
  const rows = await readSupabaseRestArray<ShareRow>(res, "停止分享失败");
  const row = rows[0];
  if (!row?.id) throw new Error("未找到分享记录");
  return toShareView(row);
};

export const getPublicShareMeta = async (shareCode: string): Promise<PublicShareMeta | null> => {
  await purgeStoppedSharesByAdmin();
  const code = normalizeShareCode(shareCode);
  if (!code) return null;
  const rows = await readShareRowsByQuery(
    `user_r2_shares?select=${SELECT_COLUMNS}&share_code=eq.${encodeFilter(code)}&limit=1`,
  );
  const row = rows[0];
  if (!row?.id) return null;
  return toPublicMeta(row);
};

export const getPublicShareRow = async (shareCode: string): Promise<ShareRow | null> => {
  await purgeStoppedSharesByAdmin();
  const code = normalizeShareCode(shareCode);
  if (!code) return null;
  const rows = await readShareRowsByQuery(
    `user_r2_shares?select=${SELECT_COLUMNS}&share_code=eq.${encodeFilter(code)}&limit=1`,
  );
  return rows[0] ?? null;
};

export const verifySharePasscode = async (row: ShareRow, passcode: string) => {
  if (!row.passcode_enabled) return true;
  if (!row.passcode_salt || !row.passcode_hash) return false;
  const normalized = normalizePasscode(passcode);
  if (!normalized) return false;
  return await verifyPasscodeHash(normalized, row.passcode_salt, row.passcode_hash);
};

export const ensurePublicShareReady = (row: ShareRow) => {
  ensureShareActive(row);
  return toPublicMeta(row);
};

export const resolvePublicShareCredentials = async (row: ShareRow) => {
  return await resolveShareBucketCredentials(row);
};

export const issueDownloadRedirectUrl = async (
  origin: string,
  creds: RouteTokenCredentials,
  key: string,
  filename: string,
): Promise<string> => {
  const token = await issueRouteToken(
    {
      op: "object",
      creds,
      key,
      download: true,
    },
    10 * 60,
  );
  return `${origin}/api/object?token=${encodeURIComponent(token)}&filename=${encodeURIComponent(filename)}`;
};

export const normalizeShareFolderPath = (raw: string) => {
  const input = String(raw ?? "").trim();
  if (!input) return "";
  const normalized = input.replaceAll("\\", "/");
  const parts = normalized
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.some((p) => p === "." || p === "..")) {
    throw new Error("目录路径无效");
  }
  return parts.length ? `${parts.join("/")}/` : "";
};

export const resolveShareDownloadKey = (row: ShareRow, rawKey: string | null) => {
  if (row.item_type === "file") return row.item_key;

  const key = String(rawKey ?? "").trim();
  if (!key) throw new Error("缺少文件路径参数");
  if (!key.startsWith(row.item_key)) throw new Error("下载路径超出分享范围");
  if (key.endsWith("/")) throw new Error("不支持下载文件夹");
  return key;
};

export const touchShareAccess = async (row: ShareRow) => {
  const nextCount = (Number(row.access_count ?? 0) || 0) + 1;
  const res = await supabaseAdminRestFetch(`user_r2_shares?id=eq.${encodeFilter(row.id)}`, {
    method: "PATCH",
    body: {
      access_count: nextCount,
      last_accessed_at: new Date().toISOString(),
    },
    prefer: "return=minimal",
  });
  if (!res.ok) {
    // Best effort only.
    return;
  }
};

export const sanitizeShareFileName = (raw: string) => {
  const cleaned = String(raw ?? "").replaceAll("\n", " ").replaceAll("\r", " ").replaceAll('"', "'");
  const safe = cleaned.trim();
  return safe.slice(0, 180) || "download";
};
