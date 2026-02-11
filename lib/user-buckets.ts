import { decryptCredential, encryptCredential } from "@/lib/crypto";
import { supabaseRestFetch, readSupabaseRestArray } from "@/lib/supabase";
import type { RouteTokenCredentials } from "@/lib/route-token";

type UserBucketRow = {
  id: string;
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

export type UserBucketView = {
  id: string;
  Name: string;
  CreationDate: string;
  transferMode: BucketTransferMode;
  bucketLabel: string;
  bucketName: string;
  accountId: string;
  isDefault: boolean;
  publicBaseUrl?: string;
  customBaseUrl?: string;
};

export type UserBucketDetail = {
  id: string;
  userId: string;
  bucketLabel: string;
  bucketName: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
  customBaseUrl?: string;
  transferModeOverride?: "auto" | "presigned" | "proxy";
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UpsertBucketInput = {
  bucketLabel?: string;
  bucketName?: string;
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicBaseUrl?: string;
  customBaseUrl?: string;
  transferModeOverride?: "auto" | "presigned" | "proxy";
  isDefault?: boolean;
};

const SELECT_COLUMNS =
  "id,user_id,bucket_label,bucket_name,account_id,access_key_id_enc,secret_access_key_enc,public_base_url,custom_base_url,transfer_mode_override,is_default,created_at,updated_at";

const encodeFilter = (value: string) => encodeURIComponent(value);

const normalizeBaseUrl = (raw?: string | null) => {
  const t = String(raw ?? "").trim();
  if (!t) return undefined;
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  return withProto.endsWith("/") ? withProto : `${withProto}/`;
};

const normalizeBucketName = (raw?: string | null) => String(raw ?? "").trim();
const normalizeAccountId = (raw?: string | null) => String(raw ?? "").trim();
const normalizeLabel = (label?: string | null, bucketName?: string | null) => {
  const t = String(label ?? "").trim();
  if (t) return t;
  return String(bucketName ?? "").trim();
};

const validateBucketName = (bucketName: string) => /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/i.test(bucketName);

const rowToView = (row: UserBucketRow): UserBucketView => ({
  id: row.id,
  Name: row.bucket_label || row.bucket_name,
  CreationDate: row.created_at,
  transferMode: "presigned",
  bucketLabel: row.bucket_label || row.bucket_name,
  bucketName: row.bucket_name,
  accountId: row.account_id,
  isDefault: Boolean(row.is_default),
  publicBaseUrl: normalizeBaseUrl(row.public_base_url),
  customBaseUrl: normalizeBaseUrl(row.custom_base_url),
});

const readRows = async (pathWithQuery: string, token: string, fallback: string) => {
  const res = await supabaseRestFetch(pathWithQuery, { token, method: "GET" });
  return await readSupabaseRestArray<UserBucketRow>(res, fallback);
};

const setDefaultBucketInternal = async (token: string, bucketId: string) => {
  await supabaseRestFetch("user_r2_buckets?is_default=eq.true", {
    token,
    method: "PATCH",
    body: { is_default: false },
  });

  const res = await supabaseRestFetch(`user_r2_buckets?id=eq.${encodeFilter(bucketId)}`, {
    token,
    method: "PATCH",
    body: { is_default: true },
    prefer: "return=minimal",
  });
  if (!res.ok) throw new Error("设置默认存储桶失败");
};

const ensureDefaultBucketExists = async (token: string) => {
  const currentDefault = await readRows("user_r2_buckets?select=id&is_default=eq.true&limit=1", token, "读取默认存储桶失败");
  if (currentDefault.length > 0) return;

  const first = await readRows("user_r2_buckets?select=id&order=created_at.asc&limit=1", token, "读取存储桶列表失败");
  if (first[0]?.id) {
    await setDefaultBucketInternal(token, String(first[0].id));
  }
};

export const listUserBucketViews = async (token: string) => {
  const rows = await readRows(`user_r2_buckets?select=${SELECT_COLUMNS}&order=is_default.desc,created_at.asc`, token, "读取存储桶列表失败");
  return rows.map(rowToView);
};

export const getUserBucketDetail = async (token: string, bucketId: string): Promise<UserBucketDetail> => {
  const rows = await readRows(
    `user_r2_buckets?select=${SELECT_COLUMNS}&id=eq.${encodeFilter(bucketId)}&limit=1`,
    token,
    "读取存储桶信息失败",
  );
  const row = rows[0];
  if (!row) throw new Error("未找到存储桶");

  return {
    id: row.id,
    userId: row.user_id,
    bucketLabel: row.bucket_label || row.bucket_name,
    bucketName: row.bucket_name,
    accountId: row.account_id,
    accessKeyId: await decryptCredential(row.access_key_id_enc),
    secretAccessKey: await decryptCredential(row.secret_access_key_enc),
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
};

export const resolveBucketCredentials = async (
  token: string,
  bucketId: string,
): Promise<{ detail: UserBucketDetail; creds: RouteTokenCredentials }> => {
  const detail = await getUserBucketDetail(token, bucketId);
  return {
    detail,
    creds: {
      accountId: detail.accountId,
      accessKeyId: detail.accessKeyId,
      secretAccessKey: detail.secretAccessKey,
      bucketName: detail.bucketName,
    },
  };
};

export const createUserBucket = async (token: string, userId: string, input: UpsertBucketInput): Promise<UserBucketView> => {
  const bucketName = normalizeBucketName(input.bucketName);
  const accountId = normalizeAccountId(input.accountId);
  const bucketLabel = normalizeLabel(input.bucketLabel, bucketName);
  const accessKeyId = String(input.accessKeyId ?? "").trim();
  const secretAccessKey = String(input.secretAccessKey ?? "").trim();

  if (!bucketName) throw new Error("桶名称不能为空");
  if (!validateBucketName(bucketName)) throw new Error("桶名称格式不正确");
  if (!accountId) throw new Error("Account ID 不能为空");
  if (!accessKeyId) throw new Error("Access Key ID 不能为空");
  if (!secretAccessKey) throw new Error("Secret Access Key 不能为空");

  const existing = await readRows(
    `user_r2_buckets?select=${SELECT_COLUMNS}&account_id=eq.${encodeFilter(accountId)}&bucket_name=eq.${encodeFilter(bucketName)}&limit=1`,
    token,
    "校验存储桶是否已存在失败",
  );
  if (existing[0]?.id) {
    return await updateUserBucket(token, existing[0].id, {
      bucketLabel: input.bucketLabel,
      bucketName,
      accountId,
      accessKeyId,
      secretAccessKey,
      publicBaseUrl: input.publicBaseUrl,
      customBaseUrl: input.customBaseUrl,
      transferModeOverride: input.transferModeOverride,
      isDefault: input.isDefault === true,
    });
  }

  const payload = {
    user_id: userId,
    bucket_label: bucketLabel,
    bucket_name: bucketName,
    account_id: accountId,
    access_key_id_enc: await encryptCredential(accessKeyId),
    secret_access_key_enc: await encryptCredential(secretAccessKey),
    public_base_url: normalizeBaseUrl(input.publicBaseUrl) ?? null,
    custom_base_url: normalizeBaseUrl(input.customBaseUrl) ?? null,
    transfer_mode_override:
      input.transferModeOverride === "auto" || input.transferModeOverride === "presigned" || input.transferModeOverride === "proxy"
        ? input.transferModeOverride
        : null,
    is_default: Boolean(input.isDefault),
  };

  const res = await supabaseRestFetch("user_r2_buckets", {
    token,
    method: "POST",
    body: payload,
    prefer: "return=representation",
  });

  const rows = await readSupabaseRestArray<UserBucketRow>(res, "新增存储桶失败");
  const created = rows[0];
  if (!created?.id) throw new Error("新增存储桶失败");

  if (payload.is_default) {
    await setDefaultBucketInternal(token, created.id);
  } else {
    await ensureDefaultBucketExists(token);
  }

  return rowToView(created);
};

export const updateUserBucket = async (
  token: string,
  bucketId: string,
  input: UpsertBucketInput,
): Promise<UserBucketView> => {
  const patch: Record<string, unknown> = {};

  if (input.bucketName !== undefined) {
    const bucketName = normalizeBucketName(input.bucketName);
    if (!bucketName) throw new Error("桶名称不能为空");
    if (!validateBucketName(bucketName)) throw new Error("桶名称格式不正确");
    patch.bucket_name = bucketName;
  }

  if (input.bucketLabel !== undefined) {
    const label = String(input.bucketLabel ?? "").trim();
    if (label) patch.bucket_label = label;
  }

  if (input.accountId !== undefined) {
    const accountId = normalizeAccountId(input.accountId);
    if (!accountId) throw new Error("Account ID 不能为空");
    patch.account_id = accountId;
  }

  if (input.accessKeyId !== undefined) {
    const accessKeyId = String(input.accessKeyId ?? "").trim();
    if (accessKeyId) patch.access_key_id_enc = await encryptCredential(accessKeyId);
  }

  if (input.secretAccessKey !== undefined) {
    const secretAccessKey = String(input.secretAccessKey ?? "").trim();
    if (secretAccessKey) patch.secret_access_key_enc = await encryptCredential(secretAccessKey);
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
    const res = await supabaseRestFetch(`user_r2_buckets?id=eq.${encodeFilter(bucketId)}`, {
      token,
      method: "PATCH",
      body: patch,
      prefer: "return=representation",
    });

    const rows = await readSupabaseRestArray<UserBucketRow>(res, "更新存储桶失败");
    if (!rows[0]?.id) throw new Error("未找到存储桶");
  }

  if (input.isDefault === true) {
    await setDefaultBucketInternal(token, bucketId);
  }

  const rows = await readRows(
    `user_r2_buckets?select=${SELECT_COLUMNS}&id=eq.${encodeFilter(bucketId)}&limit=1`,
    token,
    "刷新存储桶信息失败",
  );
  const row = rows[0];
  if (!row) throw new Error("未找到存储桶");
  return rowToView(row);
};

export const deleteUserBucket = async (token: string, bucketId: string) => {
  const res = await supabaseRestFetch(`user_r2_buckets?id=eq.${encodeFilter(bucketId)}`, {
    token,
    method: "DELETE",
    prefer: "return=minimal",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "删除存储桶失败");
  }
  await ensureDefaultBucketExists(token);
};

export const setDefaultBucket = async (token: string, bucketId: string) => {
  await setDefaultBucketInternal(token, bucketId);
};
