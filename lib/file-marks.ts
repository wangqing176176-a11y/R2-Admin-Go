import type { AppAccessContext } from "@/lib/access-control";
import { copyObjectInBucket, createR2Bucket, type R2BucketLike, type R2ClientCredentials } from "@/lib/r2-s3";
import { readSupabaseRestArray, supabaseAdminRestFetch } from "@/lib/supabase";
import { resolveBucketCredentials } from "@/lib/user-buckets";

export type MarkedFileItem = {
  name: string;
  key: string;
  type: "folder" | "file";
  size?: number;
  lastModified?: string;
  isFavorite?: boolean;
  favoriteId?: string;
  trashId?: string;
  originalPath?: string;
  deletedBy?: string;
  deletedByEmail?: string;
  deletedAt?: string;
  storageKey?: string;
};

type FavoriteRow = {
  id: string;
  team_id: string;
  user_id: string;
  bucket_id: string;
  item_type: "file" | "folder";
  item_key: string;
  item_name: string;
  size: number | null;
  last_modified: string | null;
  created_at: string;
  updated_at: string;
};

type RecycleRow = {
  id: string;
  team_id: string;
  bucket_id: string;
  deleted_by: string;
  item_type: "file" | "folder";
  item_key: string;
  item_name: string;
  original_path: string | null;
  storage_prefix: string;
  storage_key: string | null;
  size: number | null;
  last_modified: string | null;
  deleted_by_name: string | null;
  deleted_by_email: string | null;
  deleted_at: string;
  status: "active" | "restored" | "deleted";
};

type TrashMoveInput = {
  key: string;
  type?: "file" | "folder";
  name?: string;
  size?: number;
  lastModified?: string;
};

const FAVORITE_SELECT = "id,team_id,user_id,bucket_id,item_type,item_key,item_name,size,last_modified,created_at,updated_at";
const RECYCLE_SELECT =
  "id,team_id,bucket_id,deleted_by,item_type,item_key,item_name,original_path,storage_prefix,storage_key,size,last_modified,deleted_by_name,deleted_by_email,deleted_at,status";

export const INTERNAL_STORAGE_ROOT = ".r2-admin-go/";
export const RECYCLE_STORAGE_ROOT = `${INTERNAL_STORAGE_ROOT}recycle/`;

const encodeFilter = (value: string) => encodeURIComponent(value);

const parentPathOf = (key: string) => {
  const normalized = key.endsWith("/") ? key.slice(0, -1) : key;
  const idx = normalized.lastIndexOf("/");
  if (idx < 0) return "";
  return normalized.slice(0, idx + 1);
};

const nameOf = (key: string) => {
  const normalized = key.endsWith("/") ? key.slice(0, -1) : key;
  return normalized.split("/").filter(Boolean).pop() || normalized || "未命名";
};

const normalizeIso = (value?: string | null) => {
  if (!value) return undefined;
  const n = Date.parse(value);
  return Number.isFinite(n) ? new Date(n).toISOString() : undefined;
};

const readSize = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const readRows = async <T>(pathWithQuery: string, fallback: string) => {
  const res = await supabaseAdminRestFetch(pathWithQuery, { method: "GET" });
  return await readSupabaseRestArray<T>(res, fallback);
};

const mapConcurrent = async <T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) => {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const run = async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, run));
  return results;
};

const favoriteToItem = (row: FavoriteRow): MarkedFileItem => ({
  name: row.item_name || nameOf(row.item_key),
  key: row.item_key,
  type: row.item_type,
  size: readSize(row.size),
  lastModified: normalizeIso(row.last_modified),
  isFavorite: true,
  favoriteId: row.id,
});

const recycleToItem = (row: RecycleRow): MarkedFileItem => ({
  name: row.item_name || nameOf(row.item_key),
  key: row.item_key,
  type: row.item_type,
  size: readSize(row.size),
  lastModified: normalizeIso(row.last_modified),
  trashId: row.id,
  originalPath: row.original_path ?? "",
  deletedBy: row.deleted_by_name || row.deleted_by_email || row.deleted_by,
  deletedByEmail: row.deleted_by_email ?? "",
  deletedAt: normalizeIso(row.deleted_at),
  storageKey: row.storage_key ?? undefined,
});

const listAllKeysWithPrefix = async (bucket: R2BucketLike, prefix: string) => {
  const keys: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const res = await bucket.list({ prefix, cursor });
    for (const o of res.objects ?? []) {
      if (typeof o.key === "string" && o.key) keys.push(o.key);
    }
    if (!res.truncated || !res.cursor) break;
    cursor = res.cursor;
  }
  return keys;
};

const deleteKeys = async (bucket: R2BucketLike, keys: string[]) => {
  const unique = Array.from(new Set(keys.filter(Boolean)));
  const chunkSize = 1000;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    try {
      await bucket.delete(chunk);
    } catch {
      for (const key of chunk) await bucket.delete(key);
    }
  }
};

const copyObject = async (bucket: R2BucketLike, creds: R2ClientCredentials, fromKey: string, toKey: string) => {
  if (fromKey === toKey) return;
  try {
    await copyObjectInBucket(creds, fromKey, toKey);
    return;
  } catch {
    const obj = await bucket.get(fromKey);
    if (!obj) throw new Error("源文件不存在或已被删除");
    await bucket.put(toKey, obj.body, { httpMetadata: obj.httpMetadata, customMetadata: obj.customMetadata });
  }
};

const getFolderMeta = async (bucket: R2BucketLike, prefix: string) => {
  const keys: string[] = [];
  let size = 0;
  let lastModified = "";
  let cursor: string | undefined;
  for (;;) {
    const res = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const object of res.objects ?? []) {
      if (typeof object.key !== "string" || !object.key) continue;
      keys.push(object.key);
      size += readSize(object.size);
      const uploaded = normalizeIso(object.uploaded);
      if (uploaded && uploaded > lastModified) lastModified = uploaded;
    }
    if (!res.truncated || !res.cursor) break;
    cursor = res.cursor;
  }
  return { keys, size, lastModified: lastModified || undefined };
};

export const listFavoriteKeySet = async (ctx: AppAccessContext, bucketId: string) => {
  const rows = await readRows<Pick<FavoriteRow, "item_key">>(
    `user_r2_favorites?select=item_key&team_id=eq.${encodeFilter(ctx.team.id)}&user_id=eq.${encodeFilter(ctx.user.id)}&bucket_id=eq.${encodeFilter(bucketId)}`,
    "读取收藏状态失败",
  );
  return new Set(rows.map((r) => r.item_key));
};

export const listActiveRecycleRows = async (ctx: AppAccessContext, bucketId: string) => {
  const scope =
    ctx.role === "admin" || ctx.role === "super_admin" || ctx.isSuperAdmin
      ? `team_id=eq.${encodeFilter(ctx.team.id)}`
      : `team_id=eq.${encodeFilter(ctx.team.id)}&deleted_by=eq.${encodeFilter(ctx.user.id)}`;
  return await readRows<RecycleRow>(
    `user_r2_recycle_bin?select=${RECYCLE_SELECT}&${scope}&bucket_id=eq.${encodeFilter(bucketId)}&status=eq.active&order=deleted_at.desc`,
    "读取回收站失败",
  );
};

export const isRecycleHiddenKey = (key: string) => key.startsWith(INTERNAL_STORAGE_ROOT);

export const isKeyInActiveRecycle = (key: string, rows: Array<Pick<RecycleRow, "item_key" | "item_type">>) =>
  rows.some((row) => row.item_type === "folder" ? key.startsWith(row.item_key) : key === row.item_key);

export const listFavorites = async (ctx: AppAccessContext, bucketId: string): Promise<MarkedFileItem[]> => {
  await resolveBucketCredentials(ctx, bucketId);
  const rows = await readRows<FavoriteRow>(
    `user_r2_favorites?select=${FAVORITE_SELECT}&team_id=eq.${encodeFilter(ctx.team.id)}&user_id=eq.${encodeFilter(ctx.user.id)}&bucket_id=eq.${encodeFilter(bucketId)}&order=updated_at.desc`,
    "读取收藏夹失败",
  );
  return rows.map(favoriteToItem);
};

export const addFavorite = async (ctx: AppAccessContext, bucketId: string, item: TrashMoveInput) => {
  await resolveBucketCredentials(ctx, bucketId);
  const key = String(item.key ?? "").trim();
  if (!key) throw new Error("缺少收藏对象");
  const itemType = item.type ?? (key.endsWith("/") ? "folder" : "file");
  const payload = {
    team_id: ctx.team.id,
    user_id: ctx.user.id,
    bucket_id: bucketId,
    item_type: itemType,
    item_key: key,
    item_name: item.name || nameOf(key),
    size: readSize(item.size),
    last_modified: normalizeIso(item.lastModified) ?? null,
  };
  const res = await supabaseAdminRestFetch("user_r2_favorites?on_conflict=team_id,user_id,bucket_id,item_key", {
    method: "POST",
    body: payload,
    prefer: "resolution=merge-duplicates,return=representation",
  });
  const rows = await readSupabaseRestArray<FavoriteRow>(res, "添加收藏失败");
  return rows[0] ? favoriteToItem(rows[0]) : null;
};

export const removeFavorite = async (ctx: AppAccessContext, bucketId: string, key: string) => {
  await resolveBucketCredentials(ctx, bucketId);
  const res = await supabaseAdminRestFetch(
    `user_r2_favorites?team_id=eq.${encodeFilter(ctx.team.id)}&user_id=eq.${encodeFilter(ctx.user.id)}&bucket_id=eq.${encodeFilter(bucketId)}&item_key=eq.${encodeFilter(key)}`,
    { method: "DELETE", prefer: "return=minimal" },
  );
  if (!res.ok) throw new Error("取消收藏失败");
};

export const listRecycleItems = async (ctx: AppAccessContext, bucketId: string): Promise<MarkedFileItem[]> => {
  await resolveBucketCredentials(ctx, bucketId);
  const rows = await listActiveRecycleRows(ctx, bucketId);
  return rows.map(recycleToItem);
};

export const moveItemsToRecycle = async (ctx: AppAccessContext, bucketId: string, inputs: TrashMoveInput[]) => {
  const { creds } = await resolveBucketCredentials(ctx, bucketId);
  const bucket = createR2Bucket(creds);
  const normalizedInputs = inputs.filter((input) => {
    const key = String(input.key ?? "").trim();
    return key && !isRecycleHiddenKey(key);
  });

  const prepared = await mapConcurrent(normalizedInputs, 4, async (input) => {
    const sourceKey = String(input.key ?? "").trim();
    const itemType = input.type ?? (sourceKey.endsWith("/") ? "folder" : "file");
    const id = crypto.randomUUID();
    const storagePrefix = `${RECYCLE_STORAGE_ROOT}${ctx.team.id}/${id}/`;
    const itemName = input.name || nameOf(sourceKey);
    const originalPath = parentPathOf(sourceKey);
    let keys: string[] = [];
    const storageKey = itemType === "file" ? `${storagePrefix}${itemName}` : null;
    let size = readSize(input.size);
    let lastModified = normalizeIso(input.lastModified);

    if (itemType === "folder") {
      const meta = await getFolderMeta(bucket, sourceKey.endsWith("/") ? sourceKey : `${sourceKey}/`);
      keys = meta.keys;
      size = meta.size || size;
      lastModified = meta.lastModified ?? lastModified;
      if (!keys.length) keys = [sourceKey.endsWith("/") ? sourceKey : `${sourceKey}/`];
    } else {
      keys = [sourceKey];
    }

    const itemKey = itemType === "folder" && !sourceKey.endsWith("/") ? `${sourceKey}/` : sourceKey;
    await mapConcurrent(keys, 4, async (key) => {
      const targetKey = itemType === "folder" ? `${storagePrefix}${key.slice(itemKey.length)}` : storageKey!;
      if (key === targetKey) return;
      try {
        await copyObject(bucket, creds, key, targetKey);
      } catch (error) {
        if (itemType === "folder" && key.endsWith("/")) {
          await bucket.put(targetKey, new Uint8Array(0), { httpMetadata: { contentType: "application/x-directory" } });
          return;
        }
        throw error;
      }
    });

    return {
      keys,
      rowPayload: {
      id,
      team_id: ctx.team.id,
      bucket_id: bucketId,
      deleted_by: ctx.user.id,
      item_type: itemType,
      item_key: itemKey,
      item_name: itemName,
      original_path: originalPath,
      storage_prefix: storagePrefix,
      storage_key: storageKey,
      size,
      last_modified: lastModified ?? null,
      deleted_by_name: ctx.displayName,
      deleted_by_email: ctx.user.email ?? "",
      status: "active",
      },
    };
  });

  if (!prepared.length) return [];

  const insert = await supabaseAdminRestFetch("user_r2_recycle_bin", {
    method: "POST",
    body: prepared.map((item) => item.rowPayload),
    prefer: "return=representation",
  });
  const rows = await readSupabaseRestArray<RecycleRow>(insert, "移动到回收站失败");
  if (rows.length !== prepared.length) throw new Error("移动到回收站失败");

  await mapConcurrent(prepared, 4, async (item) => deleteKeys(bucket, item.keys));
  const itemKeys = rows.map((row) => row.item_key);
  if (itemKeys.length) {
    const encodedKeys = itemKeys.map((key) => `"${key.replace(/"/g, '\\"')}"`).join(",");
    await supabaseAdminRestFetch(
      `user_r2_favorites?team_id=eq.${encodeFilter(ctx.team.id)}&user_id=eq.${encodeFilter(ctx.user.id)}&bucket_id=eq.${encodeFilter(bucketId)}&item_key=in.(${encodeURIComponent(encodedKeys)})`,
      { method: "DELETE", prefer: "return=minimal" },
    ).catch(() => null);
  }
  return rows.map(recycleToItem);
};

const findRestoreTarget = async (bucket: R2BucketLike, originalKey: string, itemType: "file" | "folder") => {
  const normalized = itemType === "folder" && !originalKey.endsWith("/") ? `${originalKey}/` : originalKey;
  const exists = itemType === "folder"
    ? (await listAllKeysWithPrefix(bucket, normalized)).length > 0
    : Boolean(await bucket.head(normalized));
  if (!exists) return normalized;

  const basePath = parentPathOf(normalized);
  const baseName = nameOf(normalized);
  const extIdx = itemType === "file" ? baseName.lastIndexOf(".") : -1;
  const stem = extIdx > 0 ? baseName.slice(0, extIdx) : baseName;
  const ext = extIdx > 0 ? baseName.slice(extIdx) : "";
  for (let i = 1; i < 100; i += 1) {
    const candidate = itemType === "folder"
      ? `${basePath}${baseName} (${i})/`
      : `${basePath}${stem} (${i})${ext}`;
    const candidateExists = itemType === "folder"
      ? (await listAllKeysWithPrefix(bucket, candidate)).length > 0
      : Boolean(await bucket.head(candidate));
    if (!candidateExists) return candidate;
  }
  throw new Error("原路径已存在同名对象，请先处理后再恢复");
};

export const restoreRecycleItem = async (ctx: AppAccessContext, bucketId: string, recycleId: string) => {
  const { creds } = await resolveBucketCredentials(ctx, bucketId);
  const rows = await listActiveRecycleRows(ctx, bucketId);
  const row = rows.find((item) => item.id === recycleId);
  if (!row) throw new Error("回收站对象不存在或无权访问");

  const bucket = createR2Bucket(creds);
  const restoreTarget = await findRestoreTarget(bucket, row.item_key, row.item_type);
  const trashKeys = row.item_type === "folder" ? await listAllKeysWithPrefix(bucket, row.storage_prefix) : [row.storage_key].filter(Boolean) as string[];
  for (const trashKey of trashKeys) {
    const targetKey = row.item_type === "folder"
      ? `${restoreTarget}${trashKey.slice(row.storage_prefix.length)}`
      : restoreTarget;
    await copyObject(bucket, creds, trashKey, targetKey);
  }
  await deleteKeys(bucket, trashKeys);

  const patch = await supabaseAdminRestFetch(
    `user_r2_recycle_bin?id=eq.${encodeFilter(row.id)}&team_id=eq.${encodeFilter(ctx.team.id)}&bucket_id=eq.${encodeFilter(bucketId)}`,
    { method: "PATCH", body: { status: "restored", restored_at: new Date().toISOString() }, prefer: "return=minimal" },
  );
  if (!patch.ok) throw new Error("恢复文件失败");
  return restoreTarget;
};

export const permanentlyDeleteRecycleItem = async (ctx: AppAccessContext, bucketId: string, recycleId: string) => {
  if (!(ctx.role === "admin" || ctx.role === "super_admin" || ctx.isSuperAdmin)) {
    const err = new Error("协作成员不能彻底删除文件") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  const { creds } = await resolveBucketCredentials(ctx, bucketId);
  const rows = await listActiveRecycleRows(ctx, bucketId);
  const row = rows.find((item) => item.id === recycleId);
  if (!row) throw new Error("回收站对象不存在或无权访问");

  const bucket = createR2Bucket(creds);
  const trashKeys = row.item_type === "folder" ? await listAllKeysWithPrefix(bucket, row.storage_prefix) : [row.storage_key].filter(Boolean) as string[];
  await deleteKeys(bucket, trashKeys);
  const patch = await supabaseAdminRestFetch(
    `user_r2_recycle_bin?id=eq.${encodeFilter(row.id)}&team_id=eq.${encodeFilter(ctx.team.id)}&bucket_id=eq.${encodeFilter(bucketId)}`,
    { method: "PATCH", body: { status: "deleted", permanently_deleted_at: new Date().toISOString() }, prefer: "return=minimal" },
  );
  if (!patch.ok) throw new Error("彻底删除失败");
};

export const restoreRecycleItems = async (ctx: AppAccessContext, bucketId: string, recycleIds: string[]) => {
  const restored: string[] = [];
  for (const id of Array.from(new Set(recycleIds.filter(Boolean)))) {
    restored.push(await restoreRecycleItem(ctx, bucketId, id));
  }
  return restored;
};

export const permanentlyDeleteRecycleItems = async (ctx: AppAccessContext, bucketId: string, recycleIds: string[]) => {
  for (const id of Array.from(new Set(recycleIds.filter(Boolean)))) {
    await permanentlyDeleteRecycleItem(ctx, bucketId, id);
  }
};

export const clearRecycleItems = async (ctx: AppAccessContext, bucketId: string) => {
  if (!(ctx.role === "admin" || ctx.role === "super_admin" || ctx.isSuperAdmin)) {
    const err = new Error("协作成员不能清空回收站") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  const rows = await listActiveRecycleRows(ctx, bucketId);
  await permanentlyDeleteRecycleItems(ctx, bucketId, rows.map((row) => row.id));
  return rows.length;
};
