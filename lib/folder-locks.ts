import { NextRequest } from "next/server";
import { listTeamMembersByTeamId, type AppAccessContext } from "@/lib/access-control";
import { createPasscodeSalt } from "@/lib/share-security";
import { readSupabaseRestArray, supabaseAdminRestFetch } from "@/lib/supabase";
import { createFolderLockedError, readFolderUnlockGrants } from "@/lib/folder-lock-access";
import { hashFolderPassword, validateFolderPassword, verifyFolderPassword } from "@/lib/folder-password";
import { canDiscoverFolderPath, emptyFolderAccessPolicy, evaluateFolderAccess, findEffectiveFolderLockFromRows, folderPolicyRequiresPassword, getFolderAccessPolicy, type FolderAccessDecision, type FolderAccessPolicy } from "@/lib/folder-access-policy";
export { findEffectiveFolderLockFromRows, pathWithinFolderPrefix } from "@/lib/folder-access-policy";

export type FolderLockRow = {
  id: string;
  team_id: string;
  bucket_id: string;
  prefix: string;
  owner_user_id: string;
  hint: string | null;
  passcode_salt: string | null;
  passcode_hash: string | null;
  access_policy?: FolderAccessPolicy | null;
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
  policy: FolderAccessPolicy;
  passwordEnabled: boolean;
};

export type UpsertFolderLockInput = {
  bucketId: string;
  prefix: string;
  passcode: string;
  hint?: string;
  policy?: Omit<FolderAccessPolicy, "version">;
};

const SELECT_COLUMNS =
  "*"; // Old databases remain readable until the additive policy migration runs.

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
  const prefix = String(raw ?? "");
  if (!prefix || prefix.startsWith("/") || prefix.startsWith(".r2-admin-go/") || /[\u0000-\u001f\u007f\\]/.test(prefix)
    || prefix.split("/").some((part) => part === "." || part === "..")) throw createHttpError(400, "请选择一个有效文件夹");
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
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
  policy: getFolderAccessPolicy(row),
  passwordEnabled: Boolean(row.passcode_hash && row.passcode_salt),
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
        throw createHttpError(503, "文件夹保护数据库未初始化，请先执行数据库升级脚本");
      }
    }
    return await readSupabaseRestArray<FolderLockRow>(res, fallbackError);
  } catch (error) {
    if (isMissingFolderLockTableError(error)) throw createHttpError(503, "文件夹保护数据库未初始化，请先执行数据库升级脚本");
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

export const findEffectiveFolderLock = async (ctx: Pick<AppAccessContext, "team">, bucketId: string, path: string) => {
  const rows = await listFolderLocksByBucket(ctx, bucketId);
  return findEffectiveFolderLockFromRows(rows, path);
};

export const verifyFolderLockPasscode = async (row: Pick<FolderLockRow, "passcode_salt" | "passcode_hash">, passcode: string) => {
  if (!row.passcode_salt || !row.passcode_hash || passcode.length > 128) return false;
  return await verifyFolderPassword(passcode, row.passcode_salt, row.passcode_hash);
};

export const assertFolderLockManager = (ctx: AppAccessContext) => {
  if (ctx.role === "admin" || ctx.role === "super_admin") return;
  throw createHttpError(403, "仅管理员可管理加密文件夹");
};

export const upsertFolderLock = async (ctx: AppAccessContext, input: UpsertFolderLockInput) => {
  assertFolderLockManager(ctx);
  const bucketId = String(input.bucketId ?? "").trim();
  if (!bucketId) throw createHttpError(400, "缺少存储桶参数");
  const prefix = normalizeFolderLockPrefix(input.prefix);
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

  const rawPolicy = input.policy ?? (exact ? getFolderAccessPolicy(exact) : emptyFolderAccessPolicy());
  if (!["password", "members", "members_password"].includes(rawPolicy.mode)) throw createHttpError(400, "无效的保护方式");
  const parseIds = (raw: unknown) => {
    if (!Array.isArray(raw) || raw.length > 1000 || raw.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) throw createHttpError(400, "成员选择无效");
    return [...new Set(raw)] as string[];
  };
  const allowedUserIds = parseIds(rawPolicy.allowedUserIds);
  const deniedUserIds = parseIds(rawPolicy.deniedUserIds);
  if (!Array.isArray(rawPolicy.allowedRoles) || rawPolicy.allowedRoles.some((role) => !["super_admin", "admin", "member"].includes(role))) throw createHttpError(400, "角色选择无效");
  if (typeof rawPolicy.hideUnauthorized !== "boolean") throw createHttpError(400, "隐藏设置无效");
  const ownerId = exact?.owner_user_id ?? ctx.user.id;
  if (deniedUserIds.includes(ctx.user.id) || deniedUserIds.includes(ownerId)) throw createHttpError(400, "不能排除自己或保护创建者");
  const members = await listTeamMembersByTeamId(ctx.team.id);
  const memberIds = new Set(members.map((member) => member.user_id));
  if ([...allowedUserIds, ...deniedUserIds].some((id) => !memberIds.has(id))) throw createHttpError(400, "只能选择当前团队的成员");
  const policy: FolderAccessPolicy = {
    mode: rawPolicy.mode,
    allowedUserIds: rawPolicy.mode === "password" ? [] : [...new Set([...allowedUserIds, ctx.user.id, ownerId])],
    allowedRoles: rawPolicy.mode === "password" ? [] : [...new Set(rawPolicy.allowedRoles)],
    deniedUserIds, hideUnauthorized: rawPolicy.hideUnauthorized, version: crypto.randomUUID(),
  };
  let salt = exact?.passcode_salt ?? null;
  let hash = exact?.passcode_hash ?? null;
  if (folderPolicyRequiresPassword(policy)) {
    if (input.passcode) {
      validateFolderPassword(input.passcode);
      salt = createPasscodeSalt();
      hash = await hashFolderPassword(input.passcode, salt);
    } else if (!salt || !hash) throw createHttpError(400, "请设置访问密码");
  } else { salt = null; hash = null; }

  if (exact?.id) {
    const res = await supabaseAdminRestFetch(`user_r2_folder_locks?id=eq.${encodeFilter(exact.id)}`, {
      method: "PATCH",
      body: {
        hint,
        passcode_salt: salt,
        passcode_hash: hash,
        access_policy: policy,
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
      access_policy: policy,
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

// Folder locks are also path references. Keep a lock attached when its folder is
// renamed or moved, including a lock that belongs to a child folder.
export const remapFolderLocksForFolderMove = async (
  ctx: AppAccessContext,
  bucketId: string,
  sourcePrefix: string,
  targetPrefix: string,
) => {
  const source = normalizeFolderLockPrefix(sourcePrefix);
  const target = normalizeFolderLockPrefix(targetPrefix);
  const rows = await listFolderLocksByBucket(ctx, bucketId, { includeDisabled: true });
  const affected = rows.filter((row) => row.prefix.startsWith(source));
  for (const row of affected) {
    const nextPrefix = `${target}${row.prefix.slice(source.length)}`;
    const res = await supabaseAdminRestFetch(`user_r2_folder_locks?id=eq.${encodeFilter(row.id)}`, {
      method: "PATCH",
      body: { prefix: nextPrefix, updated_by: ctx.user.id },
      prefer: "return=minimal",
    });
    if (!res.ok) throw new Error("同步加密文件夹路径失败");
  }
  return affected.length;
};

export const removeFolderLocksForDeletedObjectKeys = async (
  ctx: AppAccessContext,
  bucketId: string,
  sourceKeys: string[],
) => {
  const normalized = Array.from(new Set(sourceKeys.filter((key) => key.endsWith("/"))));
  if (!normalized.length) return 0;
  const rows = await listFolderLocksByBucket(ctx, bucketId, { includeDisabled: true });
  const affected = rows.filter((row) => normalized.some((prefix) => row.prefix.startsWith(prefix)));
  for (const row of affected) {
    const res = await supabaseAdminRestFetch(`user_r2_folder_locks?id=eq.${encodeFilter(row.id)}`, {
      method: "DELETE",
      prefer: "return=minimal",
    });
    if (!res.ok) throw new Error("清理加密文件夹配置失败");
  }
  return affected.length;
};

export const assertFolderAccessDecision = (decision: FolderAccessDecision, row: FolderLockRow | null) => {
  if (decision === "deny_hidden") throw createHttpError(404, "文件或文件夹不存在");
  if (decision === "deny_visible") throw createHttpError(403, "你没有访问此文件夹的权限");
  if (decision === "password_required" && row) throw createFolderLockedError({ bucketId: row.bucket_id, prefix: row.prefix, hint: row.hint ?? undefined });
};

export const createFolderAccessReader = async (req: NextRequest, ctx: AppAccessContext, bucketId: string) => {
  const [rows, grants] = await Promise.all([listFolderLocksByBucket(ctx, bucketId), readFolderUnlockGrants(req)]);
  const lockFor = (path: string) => findEffectiveFolderLockFromRows(rows, path);
  const decision = (path: string) => evaluateFolderAccess(ctx, lockFor(path), grants);
  const assert = (path: string, includeDescendants = false) => {
    const row = lockFor(path);
    assertFolderAccessDecision(decision(path), row);
    if (includeDescendants && path.endsWith("/")) {
      for (const child of rows) {
        if (child.prefix.startsWith(path)) assertFolderAccessDecision(evaluateFolderAccess(ctx, child, grants), child);
      }
    }
    return row;
  };
  const isVisible = (path: string) => canDiscoverFolderPath(path, lockFor(path), decision(path));
  const describe = (path: string) => {
    const row = lockFor(path);
    const access = decision(path);
    return {
      locked: Boolean(row) || rows.some((child) => child.prefix.startsWith(path) && evaluateFolderAccess(ctx, child, grants) !== "deny_hidden"),
      unlocked: access === "allow",
      access,
      protectionMode: row ? getFolderAccessPolicy(row).mode : undefined,
    };
  };
  return { rows, grants, lockFor, decision, assert, isVisible, describe };
};

export const getRequestLockedFolderMeta = async (
  req: NextRequest,
  ctx: AppAccessContext,
  bucketId: string,
  path: string,
) => {
  const access = await createFolderAccessReader(req, ctx, bucketId);
  const lock = access.lockFor(path);
  if (!lock) return null;
  return {
    lock,
    unlocked: access.decision(path) === "allow",
  };
};

export const assertFolderUnlockedForPath = async (
  req: NextRequest,
  ctx: AppAccessContext,
  bucketId: string,
  path: string,
) => {
  if (path.startsWith(".r2-admin-go/")) {
    const res = await supabaseAdminRestFetch(`user_r2_recycle_bin?select=item_key,item_type,storage_prefix,storage_key&team_id=eq.${encodeFilter(ctx.team.id)}&bucket_id=eq.${encodeFilter(bucketId)}&status=eq.active`, { method: "GET" });
    const items = await readSupabaseRestArray<{ item_key: string; item_type: string; storage_prefix: string; storage_key: string | null }>(res, "读取回收站权限失败");
    const item = items.find((item) => item.storage_key === path || (item.item_type === "folder" && path.startsWith(item.storage_prefix)));
    if (!item) throw createHttpError(404, "文件或文件夹不存在");
    path = item.item_type === "folder" ? item.item_key + path.slice(item.storage_prefix.length) : item.item_key;
  }
  const access = await createFolderAccessReader(req, ctx, bucketId);
  return access.assert(path, true);
};

// Install protections before copying any data. A failed copy may leave a safe,
// empty protected destination; it must never leave copied content unprotected.
export const copyFolderPolicies = async (ctx: AppAccessContext, bucketId: string, source: string, target: string) => {
  if (!source.endsWith("/") || source === target) return;
  const rows = await listFolderLocksByBucket(ctx, bucketId);
  const inherited = findEffectiveFolderLockFromRows(rows, source);
  const affected = rows.filter((row) => row.prefix.startsWith(source));
  if (inherited && !affected.includes(inherited)) affected.push({ ...inherited, prefix: source });
  if (!affected.length) return;
  if (rows.some((row) => !affected.includes(row) && (target.startsWith(row.prefix) || row.prefix.startsWith(target)))) {
    throw createHttpError(400, "目标目录与现有保护范围重叠，请选择其他位置");
  }
  const res = await supabaseAdminRestFetch("user_r2_folder_locks", {
    method: "POST", prefer: "return=minimal",
    body: affected.map((row) => ({
      team_id: ctx.team.id, bucket_id: bucketId, prefix: target + row.prefix.slice(source.length),
      owner_user_id: row.owner_user_id, hint: row.hint, passcode_salt: row.passcode_salt, passcode_hash: row.passcode_hash,
      access_policy: { ...getFolderAccessPolicy(row), version: crypto.randomUUID() },
      enabled: true, created_by: ctx.user.id, updated_by: ctx.user.id,
    })),
  });
  if (!res.ok) throw createHttpError(409, "无法保留目标文件夹的访问保护，请检查目标策略");
};

export const filterLockedKeysForRequest = async (
  req: NextRequest,
  ctx: AppAccessContext,
  bucketId: string,
  keys: string[],
) => {
  const access = await createFolderAccessReader(req, ctx, bucketId);
  return keys.filter((key) => access.decision(key) === "allow");
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
  const rows = await listFolderLocksByBucket(ctx, bucketId);
  return findEffectiveFolderLockFromRows(rows, path) ?? (path.endsWith("/") ? rows.find((row) => row.prefix.startsWith(path)) : null);
};

export const isPathProtectedByAnyFolderLockForTeam = async (teamId: string, bucketId: string, path: string) => {
  const rows = await listFolderLocksByTeamBucket(teamId, bucketId);
  return findEffectiveFolderLockFromRows(rows, path) ?? (path.endsWith("/") ? rows.find((row) => row.prefix.startsWith(path)) : null);
};
