import { getEnvString } from "@/lib/env";
import {
  readSupabaseRestArray,
  requireSupabaseUser,
  supabaseAdminRestFetch,
  type SupabaseUser,
} from "@/lib/supabase";

export type AppRole = "super_admin" | "admin" | "member";
export type TeamMemberStatus = "active" | "disabled";

export const ALL_PERMISSION_KEYS = [
  "account.self.manage",
  "account.self.delete",
  "bucket.read",
  "bucket.add",
  "bucket.edit",
  "object.list",
  "object.read",
  "object.upload",
  "object.rename",
  "object.move_copy",
  "object.mkdir",
  "object.delete",
  "object.search",
  "share.manage",
  "usage.read",
  "team.member.read",
  "team.member.manage",
  "team.role.manage",
  "team.permission.grant",
  "team.permission.request.create",
  "team.permission.request.review",
  "sys.team.read",
  "sys.team.manage",
  "sys.admin.manage",
  "sys.metrics.read",
] as const;

export type PermissionKey = (typeof ALL_PERMISSION_KEYS)[number];

export type AppAccessContext = {
  token: string;
  user: SupabaseUser;
  displayName: string;
  team: {
    id: string;
    name: string;
    ownerUserId: string;
  };
  role: AppRole;
  roleLabel: string;
  status: TeamMemberStatus;
  permissions: Set<PermissionKey>;
  permissionList: PermissionKey[];
  isSuperAdmin: boolean;
};

type AppTeamRow = {
  id: string;
  name: string;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
};

type AppTeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: AppRole;
  status: TeamMemberStatus;
  created_at: string;
  updated_at: string;
};

type AppUserProfileRow = {
  user_id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
};

type AppPermissionOverrideRow = {
  id: string;
  team_id: string;
  user_id: string;
  perm_key: string;
  enabled: boolean;
  expires_at: string | null;
};

const DEFAULT_SUPER_ADMIN_EMAILS = ["wangqing176176@gmail.com"];

const roleLabels: Record<AppRole, string> = {
  super_admin: "超级管理员",
  admin: "管理员",
  member: "协作成员",
};

const ROLE_DEFAULT_PERMISSIONS: Record<AppRole, PermissionKey[]> = {
  super_admin: [...ALL_PERMISSION_KEYS],
  admin: ALL_PERMISSION_KEYS.filter((k) => !k.startsWith("sys.")),
  member: [
    "account.self.manage",
    "account.self.delete",
    "bucket.read",
    "object.list",
    "object.read",
    "object.search",
    "team.permission.request.create",
  ],
};

const createHttpError = (status: number, message: string) => {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
};

const encodeFilter = (value: string) => encodeURIComponent(value);

const normalizePermission = (value: string): PermissionKey | null => {
  if ((ALL_PERMISSION_KEYS as readonly string[]).includes(value)) return value as PermissionKey;
  return null;
};

const normalizeRole = (value: unknown): AppRole => {
  if (value === "super_admin" || value === "admin" || value === "member") return value;
  return "member";
};

const normalizeMemberStatus = (value: unknown): TeamMemberStatus => {
  if (value === "disabled") return "disabled";
  return "active";
};

const guessDisplayName = (email?: string | null) => {
  const raw = String(email ?? "").trim();
  if (!raw) return "未命名成员";
  const local = raw.split("@")[0] ?? raw;
  return (local || raw).slice(0, 48) || "未命名成员";
};

const getConfiguredSuperAdminEmails = () => {
  const raw = getEnvString("SUPER_ADMIN_EMAILS", "R2_SUPER_ADMIN_EMAILS");
  const configured = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length) return configured;
  return DEFAULT_SUPER_ADMIN_EMAILS;
};

const isSuperAdminEmail = (email?: string | null) => {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return getConfiguredSuperAdminEmails().includes(normalized);
};

const readAdminRows = async <T>(pathWithQuery: string, fallback: string) => {
  const res = await supabaseAdminRestFetch(pathWithQuery, { method: "GET" });
  return await readSupabaseRestArray<T>(res, fallback);
};

const ensureUserProfile = async (user: SupabaseUser): Promise<AppUserProfileRow> => {
  const rows = await readAdminRows<AppUserProfileRow>(
    `app_user_profiles?select=user_id,display_name,created_at,updated_at&user_id=eq.${encodeFilter(user.id)}&limit=1`,
    "读取用户资料失败",
  );
  const existing = rows[0];
  if (existing?.user_id) return existing;

  const displayName = guessDisplayName(user.email);
  const insertRes = await supabaseAdminRestFetch("app_user_profiles", {
    method: "POST",
    body: {
      user_id: user.id,
      display_name: displayName,
    },
    prefer: "resolution=merge-duplicates,return=representation",
  });
  const inserted = await readSupabaseRestArray<AppUserProfileRow>(insertRes, "创建用户资料失败");
  const profile = inserted[0];
  if (!profile?.user_id) {
    throw new Error("创建用户资料失败");
  }
  return profile;
};

const ensureOwnedTeam = async (user: SupabaseUser, profile: AppUserProfileRow): Promise<AppTeamRow> => {
  const existingRows = await readAdminRows<AppTeamRow>(
    `app_teams?select=id,name,owner_user_id,created_at,updated_at&owner_user_id=eq.${encodeFilter(user.id)}&limit=1`,
    "读取团队失败",
  );
  const existing = existingRows[0];
  if (existing?.id) return existing;

  const name = `${(profile.display_name || guessDisplayName(user.email)).slice(0, 24)}的团队`;
  const insertRes = await supabaseAdminRestFetch("app_teams", {
    method: "POST",
    body: {
      owner_user_id: user.id,
      name,
    },
    prefer: "return=representation",
  });
  const inserted = await readSupabaseRestArray<AppTeamRow>(insertRes, "创建团队失败");
  const team = inserted[0];
  if (!team?.id) {
    throw new Error("创建团队失败");
  }
  return team;
};

const ensureSelfMembership = async (
  user: SupabaseUser,
  role: AppRole,
  teamId: string,
): Promise<AppTeamMemberRow> => {
  const insertRes = await supabaseAdminRestFetch("app_team_members", {
    method: "POST",
    body: {
      team_id: teamId,
      user_id: user.id,
      role,
      status: "active",
    },
    prefer: "return=representation",
  });
  const inserted = await readSupabaseRestArray<AppTeamMemberRow>(insertRes, "创建团队成员失败");
  const member = inserted[0];
  if (!member?.id) throw new Error("创建团队成员失败");
  return member;
};

const promoteToSuperAdminIfNeeded = async (member: AppTeamMemberRow, user: SupabaseUser) => {
  if (!isSuperAdminEmail(user.email)) return member;
  if (member.role === "super_admin") return member;

  const res = await supabaseAdminRestFetch(`app_team_members?id=eq.${encodeFilter(member.id)}`, {
    method: "PATCH",
    body: { role: "super_admin", status: "active" },
    prefer: "return=representation",
  });
  const rows = await readSupabaseRestArray<AppTeamMemberRow>(res, "更新成员角色失败");
  return rows[0] ?? member;
};

const ensureMembership = async (
  user: SupabaseUser,
  profile: AppUserProfileRow,
): Promise<AppTeamMemberRow> => {
  const memberRows = await readAdminRows<AppTeamMemberRow>(
    `app_team_members?select=id,team_id,user_id,role,status,created_at,updated_at&user_id=eq.${encodeFilter(user.id)}&limit=1`,
    "读取团队成员失败",
  );
  const existing = memberRows[0];
  if (existing?.id) {
    return await promoteToSuperAdminIfNeeded(existing, user);
  }

  const team = await ensureOwnedTeam(user, profile);
  const role: AppRole = isSuperAdminEmail(user.email) ? "super_admin" : "admin";
  return await ensureSelfMembership(user, role, team.id);
};

const getTeamById = async (teamId: string): Promise<AppTeamRow> => {
  const rows = await readAdminRows<AppTeamRow>(
    `app_teams?select=id,name,owner_user_id,created_at,updated_at&id=eq.${encodeFilter(teamId)}&limit=1`,
    "读取团队信息失败",
  );
  const team = rows[0];
  if (!team?.id) throw new Error("团队不存在");
  return team;
};

const readPermissionOverrides = async (teamId: string, userId: string) => {
  return await readAdminRows<AppPermissionOverrideRow>(
    `app_member_permissions?select=id,team_id,user_id,perm_key,enabled,expires_at&team_id=eq.${encodeFilter(
      teamId,
    )}&user_id=eq.${encodeFilter(userId)}&order=created_at.asc`,
    "读取权限配置失败",
  );
};

const buildPermissionSet = (role: AppRole, overrides: AppPermissionOverrideRow[]) => {
  const current = new Set<PermissionKey>(ROLE_DEFAULT_PERMISSIONS[role]);
  const nowMs = Date.now();

  for (const row of overrides) {
    const key = normalizePermission(String(row.perm_key ?? ""));
    if (!key) continue;

    if (row.expires_at) {
      const exp = Date.parse(row.expires_at);
      if (Number.isFinite(exp) && exp < nowMs) continue;
    }

    if (row.enabled) current.add(key);
    else current.delete(key);
  }
  return current;
};

export const getRoleLabel = (role: AppRole) => roleLabels[role];

export const hasPermission = (ctx: AppAccessContext, permission: PermissionKey) => ctx.permissions.has(permission);

export const requirePermission = (
  ctx: AppAccessContext,
  permission: PermissionKey,
  message = "无权限执行该操作",
) => {
  if (!hasPermission(ctx, permission)) {
    throw createHttpError(403, message);
  }
};

export const requireAnyPermission = (
  ctx: AppAccessContext,
  permissions: PermissionKey[],
  message = "无权限执行该操作",
) => {
  for (const permission of permissions) {
    if (hasPermission(ctx, permission)) return;
  }
  throw createHttpError(403, message);
};

export const assertTeamAccess = (ctx: AppAccessContext, teamId: string) => {
  if (ctx.isSuperAdmin) return;
  if (ctx.team.id !== teamId) throw createHttpError(403, "无权访问该团队");
};

export const getAppAccessContextFromRequest = async (req: Request): Promise<AppAccessContext> => {
  const auth = await requireSupabaseUser(req);
  const profile = await ensureUserProfile(auth.user);
  const member = await ensureMembership(auth.user, profile);
  const role = normalizeRole(member.role);
  const status = normalizeMemberStatus(member.status);

  if (status !== "active") {
    throw createHttpError(403, "账号已被禁用，请联系管理员");
  }

  const team = await getTeamById(member.team_id);
  const overrides = await readPermissionOverrides(team.id, auth.user.id);
  const permissions = buildPermissionSet(role, overrides);

  return {
    token: auth.token,
    user: auth.user,
    displayName: profile.display_name || guessDisplayName(auth.user.email),
    team: {
      id: team.id,
      name: team.name,
      ownerUserId: team.owner_user_id,
    },
    role,
    roleLabel: getRoleLabel(role),
    status,
    permissions,
    permissionList: Array.from(permissions),
    isSuperAdmin: role === "super_admin" || isSuperAdminEmail(auth.user.email),
  };
};

export const updateOwnDisplayName = async (ctx: AppAccessContext, displayName: string) => {
  const normalized = String(displayName ?? "").trim();
  if (!normalized) throw new Error("用户名不能为空");
  if (normalized.length > 48) throw new Error("用户名长度不能超过 48 个字符");

  const res = await supabaseAdminRestFetch(`app_user_profiles?user_id=eq.${encodeFilter(ctx.user.id)}`, {
    method: "PATCH",
    body: { display_name: normalized },
    prefer: "return=representation",
  });
  const rows = await readSupabaseRestArray<AppUserProfileRow>(res, "更新用户名失败");
  const row = rows[0];
  if (!row?.user_id) throw new Error("更新用户名失败");

  // Keep team name aligned for team owner, so "xxx的团队" updates with display name.
  if (ctx.team.ownerUserId === ctx.user.id) {
    const teamName = `${normalized.slice(0, 24)}的团队`;
    const teamRes = await supabaseAdminRestFetch(`app_teams?id=eq.${encodeFilter(ctx.team.id)}`, {
      method: "PATCH",
      body: { name: teamName },
      prefer: "return=minimal",
    });
    if (!teamRes.ok) throw new Error("更新团队名称失败");
  }

  return row;
};

export const listTeamMembersByTeamId = async (teamId: string) => {
  return await readAdminRows<AppTeamMemberRow>(
    `app_team_members?select=id,team_id,user_id,role,status,created_at,updated_at&team_id=eq.${encodeFilter(teamId)}&order=created_at.asc`,
    "读取成员失败",
  );
};

export const listProfilesByUserIds = async (userIds: string[]) => {
  if (!userIds.length) return [] as AppUserProfileRow[];
  const inList = userIds.map((id) => `"${id.replaceAll('"', "")}"`).join(",");
  return await readAdminRows<AppUserProfileRow>(
    `app_user_profiles?select=user_id,display_name,created_at,updated_at&user_id=in.(${encodeURIComponent(inList)})`,
    "读取用户资料失败",
  );
};

export const listPermissionOverridesByTeamId = async (teamId: string) => {
  return await readAdminRows<AppPermissionOverrideRow>(
    `app_member_permissions?select=id,team_id,user_id,perm_key,enabled,expires_at&team_id=eq.${encodeFilter(teamId)}&order=created_at.desc`,
    "读取权限设置失败",
  );
};

export const listAllTeams = async () => {
  return await readAdminRows<AppTeamRow>(
    "app_teams?select=id,name,owner_user_id,created_at,updated_at&order=created_at.desc",
    "读取团队失败",
  );
};

export const countRows = async (table: string, filters = "") => {
  const path = `${table}?select=id${filters ? `&${filters}` : ""}&limit=1`;
  const res = await supabaseAdminRestFetch(path, {
    method: "GET",
    headers: { Prefer: "count=exact" },
  });
  if (!res.ok) return 0;
  const contentRange = res.headers.get("content-range") ?? "";
  const match = contentRange.match(/\/(\d+)$/);
  if (!match) return 0;
  const n = Number.parseInt(match[1] ?? "0", 10);
  return Number.isFinite(n) ? n : 0;
};

export const upsertPermissionOverride = async (opts: {
  teamId: string;
  userId: string;
  permKey: PermissionKey;
  enabled: boolean;
  expiresAt?: string | null;
  grantedBy?: string;
}) => {
  const payload = {
    team_id: opts.teamId,
    user_id: opts.userId,
    perm_key: opts.permKey,
    enabled: opts.enabled,
    expires_at: opts.expiresAt ?? null,
    granted_by: opts.grantedBy ?? null,
  };

  const res = await supabaseAdminRestFetch("app_member_permissions?on_conflict=team_id,user_id,perm_key", {
    method: "POST",
    body: payload,
    prefer: "resolution=merge-duplicates,return=representation",
  });
  const rows = await readSupabaseRestArray<AppPermissionOverrideRow>(res, "更新权限配置失败");
  const row = rows[0];
  if (!row?.id) throw new Error("更新权限配置失败");
  return row;
};

export const sanitizeRoleInput = (value: unknown): AppRole | null => {
  const role = String(value ?? "").trim();
  if (role === "super_admin" || role === "admin" || role === "member") return role;
  return null;
};

export const sanitizePermissionInput = (value: unknown): PermissionKey | null => {
  return normalizePermission(String(value ?? "").trim());
};

export const sanitizeStatusInput = (value: unknown): TeamMemberStatus | null => {
  const status = String(value ?? "").trim();
  if (status === "active" || status === "disabled") return status;
  return null;
};
