import { toChineseErrorMessage } from "@/lib/error-zh";
import { readSupabaseRestArray, supabaseAdminAuthFetch, supabaseAdminRestFetch } from "@/lib/supabase";

type TeamIdRow = { id: string };

const encodeFilter = (value: string) => encodeURIComponent(value);

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
  return toChineseErrorMessage(msg || fallback, fallback);
};

const ensureRestDeleteOk = async (query: string, fallback: string) => {
  const res = await supabaseAdminRestFetch(query, { method: "DELETE", prefer: "return=minimal" });
  if (res.ok) return;
  const data = await readJsonSafe(res);
  throw new Error(pickSupabaseError(data, fallback));
};

const listOwnedTeamIds = async (userId: string) => {
  const res = await supabaseAdminRestFetch(
    `app_teams?select=id&owner_user_id=eq.${encodeFilter(userId)}`,
    { method: "GET" },
  );
  const rows = await readSupabaseRestArray<TeamIdRow>(res, "读取用户所属团队失败");
  return rows.map((row) => String(row.id ?? "").trim()).filter(Boolean);
};

const purgeTeamScopedData = async (teamId: string) => {
  const encoded = encodeFilter(teamId);
  await ensureRestDeleteOk(`app_member_permissions?team_id=eq.${encoded}`, "删除团队权限配置失败");
  await ensureRestDeleteOk(`app_permission_requests?team_id=eq.${encoded}`, "删除团队权限申请失败");
  await ensureRestDeleteOk(`user_r2_shares?team_id=eq.${encoded}`, "删除团队分享记录失败");
  await ensureRestDeleteOk(`user_r2_buckets?team_id=eq.${encoded}`, "删除团队存储桶配置失败");
  await ensureRestDeleteOk(`app_team_members?team_id=eq.${encoded}`, "删除团队成员记录失败");
  await ensureRestDeleteOk(`app_teams?id=eq.${encoded}`, "删除团队信息失败");
};

const purgeUserScopedData = async (userId: string) => {
  const encoded = encodeFilter(userId);
  await ensureRestDeleteOk(`app_member_permissions?user_id=eq.${encoded}`, "删除账号权限配置失败");
  await ensureRestDeleteOk(`app_permission_requests?user_id=eq.${encoded}`, "删除账号权限申请失败");
  await ensureRestDeleteOk(`user_r2_shares?user_id=eq.${encoded}`, "删除账号分享记录失败");
  await ensureRestDeleteOk(`user_r2_buckets?user_id=eq.${encoded}`, "删除账号存储桶配置失败");
  await ensureRestDeleteOk(`app_team_members?user_id=eq.${encoded}`, "删除账号团队成员记录失败");
  await ensureRestDeleteOk(`app_user_profiles?user_id=eq.${encoded}`, "删除账号资料失败");
};

export const revokeAuthUserSessions = async (userId: string) => {
  const res = await supabaseAdminAuthFetch(`/admin/users/${encodeURIComponent(userId)}/logout`, {
    method: "POST",
  }).catch(() => null);
  if (!res || res.ok) return;
  // Some Supabase plans may not expose this endpoint; keep best effort.
};

export const resetAuthUserPassword = async (userId: string, password: string) => {
  const res = await supabaseAdminAuthFetch(`/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: { password },
  });
  if (res.ok) {
    await revokeAuthUserSessions(userId);
    return;
  }
  const data = await readJsonSafe(res);
  throw new Error(pickSupabaseError(data, "重置密码失败"));
};

export const hardDeleteAccountByUserId = async (userId: string) => {
  const id = String(userId ?? "").trim();
  if (!id) throw new Error("缺少用户ID");

  const ownedTeamIds = await listOwnedTeamIds(id);
  for (const teamId of ownedTeamIds) {
    await purgeTeamScopedData(teamId);
  }

  await purgeUserScopedData(id);
  await revokeAuthUserSessions(id);

  const deleteAuthRes = await supabaseAdminAuthFetch(`/admin/users/${encodeURIComponent(id)}?should_soft_delete=false`, {
    method: "DELETE",
    body: { should_soft_delete: false },
  });
  if (!deleteAuthRes.ok) {
    const data = await readJsonSafe(deleteAuthRes);
    throw new Error(pickSupabaseError(data, "删除账号失败"));
  }
};
