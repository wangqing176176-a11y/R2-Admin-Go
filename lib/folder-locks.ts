import { NextRequest } from "next/server";
import type { AppAccessContext } from "@/lib/access-control";
import { createPasscodeSalt, hashPasscode, validatePasscode, verifyPasscodeHash } from "@/lib/share-security";
import { readSupabaseRestArray, supabaseAdminRestFetch } from "@/lib/supabase";
import { createFolderLockedError, hasFolderUnlockGrant, readFolderUnlockGrants, type FolderUnlockGrant } from "@/lib/folder-lock-access";

export type FolderLockRow = {
  id: string;
  team_id: string;
  bucket_id: string;
  prefix: string;
  owner_user_id: string;
  hint: string | null;
  passcode_salt: string;
  passcode_hash: string;
  enabled: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FolderLockView = {
  id: string;
  bucketId: string;
  prefix: string;
  ownerUserId: string;
  hint?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type UpsertFolderLockInput = {
  bucketId: string;
  prefix: string;
  passcode: string;
  hint?: string;
};

const SELECT_COLUMNS =
  "id,team_id,bucket_id,prefix,owner_user_id,hint,passcode_salt,passcode_hash,enabled,created_by,updated_by,created_at,updated_at";

const encodeFilter = (value: string) => encodeURIComponent(value);

const createHttpError = (status: number, message: string) => {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
};

const isMissingFolderLockTableError = (error: unknown) => {
  const msg = String((error as { message?: unknown })?.message ?? error ?? "").toLowerCase();
  return msg.includes("user_r2_folder_locks") && (msg.includes("does not exist") || msg.includes("not found") || msg.includes("relation"));
};

const normalizeHint = (raw: unknown) => {
  const v = String(raw ?? "").trim();
  return v ? v.slice(0, 80) : null;
};

export const normalizeFolderLockPrefix = (raw: string) => {
  let prefix = String(raw ?? "").trim().replaceAll("\\", "/");
  while (prefix.startsWith("/")) prefix = prefix.slice(1);
  prefix = prefix
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/");
  if (!prefix) throw new Error("请选择一个有效文件夹");
  return `${prefix}/`;
};

export const pathWithinFolderPrefix = (path: string, prefix: string) => {
  const normalizedPath = String(path ?? "").replace(/^\/+/, "");
  const normalizedPrefix = String(prefix ?? "").replace(/^\/+/, "");
  return Boolean(normalizedPath && normalizedPrefix && normalizedPath.startsWith(normalizedPrefix));
};

export const toFolderLockView = (row: FolderLockRow): FolderLockView => ({
  id: row.id,
  bucketId: row.bucket_id,
  prefix: row.prefix,
  ownerUserId: row.owner_user_id,
  hint: row.hint ?? undefined,
  enabled: Boolean(row.enabled),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const readFolderLockRows = async (pathWithQuery: string, fallbackError: string) => {
  try {
    const res = await supabaseAdminRestFetch(pathWithQuery, { method: "GET" });
    if (!res.ok) {
      const obj = (await res.clone().json().catch(() => ({}))) as { code?: unknown; message?: unknown; error?: unknown };
      const text = await res.clone().text().catch(() => "");
      const raw = `${String(obj.code ?? "")} ${String(obj.message ?? "")} ${String(obj.error ?? "")} ${text}`.toLowerCase();
      if (
        res.status === 404 ||
        raw.includes("42p01") ||
        (raw.includes("user_r2_folder_locks") && (raw.includes("relation") || raw.includes("does not exist") || raw.includes("not found")))
      ) {
        return [];
      }
    }
    return await readSupabaseRestArray<FolderLockRow>(res, fallbackError);
  } catch (error) {
    if (isMissingFolderLockTableError(error)) return [];
    throw error;
  }
};

export const listFolderLocksByBucket = async (
  ctx: Pick<AppAccessContext, "team">,
  bucketId: string,
  opts: { includeDisabled?: boolean } = {},
) => {
  const filters = [
    `team_id=eq.${encodeFilter(ctx.team.id)}`,
    `bucket_id=eq.${encodeFilter(bucketId)}`,
    opts.includeDisabled ? "" : "enabled=eq.true",
    "order=prefix.asc",
  ].filter(Boolean);
  return await readFolderLockRows(`user_r2_folder_locks?select=${SELECT_COLUMNS}&${filters.join("&")}`, "读取加密文件夹配置失败");
};

export const listFolderLocksByTeamBucket = async (teamId: string, bucketId: string) => {
  return await readFolderLockRows(
    `user_r2_folder_locks?select=${SELECT_COLUMNS}&team_id=eq.${encodeFilter(teamId)}&bucket_id=eq.${encodeFilter(bucketId)}&enabled=eq.true&order=prefix.asc`,
    "读取加密文件夹配置失败",
  );
};

export const getExactFolderLock = async (ctx: Pick<AppAccessContext, "team">, bucketId: string, prefix: string) => {
  const normalizedPrefix = normalizeFolderLockPrefix(prefix);
  const rows = await readFolderLockRows(
    `user_r2_folder_locks?select=${SELECT_COLUMNS}&team_id=eq.${encodeFilter(ctx.team.id)}&bucket_id=eq.${encodeFilter(bucketId)}&prefix=eq.${encodeFilter(normalizedPrefix)}&limit=1`,
    "读取加密文件夹配置失败",
  );
  return rows[0] ?? null;
};

export const findEffectiveFolderLockFromRows = (rows: FolderLockRow[], path: string) => {
  const candidates = rows.filter((row) => row.enabled && pathWithinFolderPrefix(path, row.prefix));
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.prefix.length - a.prefix.length);
  return candidates[0] ?? null;
};

export const findEffectiveFolderLock = async (ctx: Pick<AppAccessContext, "team">, bucketId: string, path: string) => {
  const rows = await listFolderLocksByBucket(ctx, bucketId);
  return findEffectiveFolderLockFromRows(rows, path);
};

export const verifyFolderLockPasscode = async (row: Pick<FolderLockRow, "passcode_salt" | "passcode_hash">, passcode: string) => {
  return await verifyPasscodeHash(passcode, row.passcode_salt, row.passcode_hash);
};

const assertFolderLockManager = (ctx: AppAccessContext) => {
  if (ctx.role === "admin" || ctx.role === "super_admin") return;
  throw createHttpError(403, "仅管理员可管理加密文件夹");
};

export const upsertFolderLock = async (ctx: AppAccessContext, input: UpsertFolderLockInput) => {
  assertFolderLockManager(ctx);
  const bucketId = String(input.bucketId ?? "").trim();
  if (!bucketId) throw createHttpError(400, "缺少存储桶参数");
  const prefix = normalizeFolderLockPrefix(input.prefix);
  const passcodeCheck = validatePasscode(input.passcode ?? "");
  if (!passcodeCheck.ok) throw createHttpError(400, passcodeCheck.message);
  const hint = normalizeHint(input.hint);

  const allRows = await listFolderLocksByBucket(ctx, bucketId, { includeDisabled: true });
  const exact = allRows.find((row) => row.prefix === prefix) ?? null;

  const conflict = allRows.find((row) => {
    if (!row.enabled) return false;
    if (exact && row.id === exact.id) return false;
    return row.prefix.startsWith(prefix) || prefix.startsWith(row.prefix);
  });
  if (conflict) {
    throw createHttpError(400, "暂不支持嵌套加密文件夹，请先移除冲突目录的加密配置");
  }

  const salt = createPasscodeSalt();
  const hash = await hashPasscode(passcodeCheck.passcode, salt);

  if (exact?.id) {
    const res = await supabaseAdminRestFetch(`user_r2_folder_locks?id=eq.${encodeFilter(exact.id)}`, {
      method: "PATCH",
      body: {
        hint,
        passcode_salt: salt,
        passcode_hash: hash,
        enabled: true,
        updated_by: ctx.user.id,
      },
      prefer: "return=representation",
    });
    const rows = await readSupabaseRestArray<FolderLockRow>(res, "更新加密文件夹失败");
    const row = rows[0];
    if (!row?.id) throw new Error("更新加密文件夹失败");
    return toFolderLockView(row);
  }

  const res = await supabaseAdminRestFetch("user_r2_folder_locks", {
    method: "POST",
    body: {
      team_id: ctx.team.id,
      bucket_id: bucketId,
      prefix,
      owner_user_id: ctx.user.id,
      hint,
      passcode_salt: salt,
      passcode_hash: hash,
      enabled: true,
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
    },
    prefer: "return=representation",
  });
  const rows = await readSupabaseRestArray<FolderLockRow>(res, "创建加密文件夹失败");
  const row = rows[0];
  if (!row?.id) throw new Error("创建加密文件夹失败");
  return toFolderLockView(row);
};

export const deleteFolderLock = async (ctx: AppAccessContext, bucketId: string, prefix: string) => {
  assertFolderLockManager(ctx);
  const normalizedPrefix = normalizeFolderLockPrefix(prefix);
  const res = await supabaseAdminRestFetch(
    `user_r2_folder_locks?team_id=eq.${encodeFilter(ctx.team.id)}&bucket_id=eq.${encodeFilter(bucketId)}&prefix=eq.${encodeFilter(normalizedPrefix)}`,
    {
      method: "DELETE",
      prefer: "return=representation",
    },
  );
  const rows = await readSupabaseRestArray<FolderLockRow>(res, "删除加密文件夹失败");
  return rows[0] ? toFolderLockView(rows[0]) : null;
};

const hasGrantForPath = (grants: FolderUnlockGrant[], bucketId: string, path: string) =>
  grants.some((g) => g.bucketId === bucketId && pathWithinFolderPrefix(path, g.prefix));

export const getRequestLockedFolderMeta = async (
  req: NextRequest,
  ctx: Pick<AppAccessContext, "team">,
  bucketId: string,
  path: string,
) => {
  const lock = await findEffectiveFolderLock(ctx, bucketId, path);
  if (!lock) return null;
  const unlocked = await hasFolderUnlockGrant(req, bucketId, path);
  return {
    lock,
    unlocked,
  };
};

export const assertFolderUnlockedForPath = async (
  req: NextRequest,
  ctx: Pick<AppAccessContext, "team">,
  bucketId: string,
  path: string,
) => {
  const normalizedPath = String(path ?? "").replace(/^\/+/, "");
  if (!normalizedPath) return null;
  const lock = await findEffectiveFolderLock(ctx, bucketId, normalizedPath);
  if (!lock) return null;
  const unlocked = await hasFolderUnlockGrant(req, bucketId, normalizedPath);
  if (unlocked) return lock;
  throw createFolderLockedError(
    {
      bucketId,
      prefix: lock.prefix,
      hint: lock.hint ?? undefined,
    },
    "该文件夹已加密，请先输入密码解锁后再操作",
  );
};

export const filterLockedKeysForRequest = async (
  req: NextRequest,
  ctx: Pick<AppAccessContext, "team">,
  bucketId: string,
  keys: string[],
) => {
  const rows = await listFolderLocksByBucket(ctx, bucketId);
  if (!rows.length) return keys;
  const grants = await readFolderUnlockGrants(req);
  return keys.filter((key) => {
    const lock = findEffectiveFolderLockFromRows(rows, key);
    if (!lock) return true;
    return hasGrantForPath(grants, bucketId, key);
  });
};

export const getDirectChildLockedPrefixSet = (rows: FolderLockRow[], currentPrefix: string) => {
  const parent = String(currentPrefix ?? "").replace(/^\/+/, "");
  const set = new Set<string>();
  for (const row of rows) {
    if (!row.enabled) continue;
    if (parent) {
      if (!row.prefix.startsWith(parent)) continue;
      const rest = row.prefix.slice(parent.length);
      const slash = rest.indexOf("/");
      if (!rest || slash <= 0) continue;
      const child = `${parent}${rest.slice(0, slash + 1)}`;
      set.add(child);
      continue;
    }
    const rest = row.prefix;
    const slash = rest.indexOf("/");
    if (slash <= 0) continue;
    set.add(rest.slice(0, slash + 1));
  }
  return set;
};

export const isPathProtectedByAnyFolderLock = async (ctx: Pick<AppAccessContext, "team">, bucketId: string, path: string) => {
  const lock = await findEffectiveFolderLock(ctx, bucketId, path);
  return lock;
};

export const isPathProtectedByAnyFolderLockForTeam = async (teamId: string, bucketId: string, path: string) => {
  const rows = await listFolderLocksByTeamBucket(teamId, bucketId);
  return findEffectiveFolderLockFromRows(rows, path);
};
