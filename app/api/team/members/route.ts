import { NextRequest, NextResponse } from "next/server";
import {
  assertTeamAccess,
  getAppAccessContextFromRequest,
  listPermissionOverridesByTeamId,
  listProfilesByUserIds,
  listTeamMembersByTeamId,
  requirePermission,
  sanitizeRoleInput,
  sanitizeStatusInput,
} from "@/lib/access-control";
import { hardDeleteAccountByUserId, resetAuthUserPassword } from "@/lib/account-cleanup";
import { readSupabaseRestArray, supabaseAdminAuthFetch, supabaseAdminRestFetch } from "@/lib/supabase";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const MAX_BATCH_IMPORT = 200;

type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: "super_admin" | "admin" | "member";
  status: "active" | "disabled";
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  user_id: string;
  display_name: string;
};

type PermissionRow = {
  id: string;
  user_id: string;
  perm_key: string;
  enabled: boolean;
  expires_at: string | null;
};

type MemberCreatePayload = {
  email: string;
  password: string;
  displayName: string;
  role: "super_admin" | "admin" | "member";
};

const encodeFilter = (value: string) => encodeURIComponent(value);

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown, fallback: string) => toChineseErrorMessage(error, fallback);

const readJsonSafe = async (res: Response): Promise<Record<string, unknown>> => {
  try {
    const data = (await res.json()) as Record<string, unknown>;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
};

const listAuthUsers = async () => {
  const res = await supabaseAdminAuthFetch("/admin/users?page=1&per_page=1000", { method: "GET" });
  const data = await readJsonSafe(res);
  const usersRaw = Array.isArray(data.users) ? data.users : [];
  const users = usersRaw
    .map((u) => ({
      id: String((u as { id?: unknown }).id ?? "").trim(),
      email: String((u as { email?: unknown }).email ?? "").trim(),
    }))
    .filter((u) => u.id);
  return users;
};

const countActiveAdmins = (members: TeamMemberRow[]) => {
  return members.filter((m) => m.status === "active" && (m.role === "admin" || m.role === "super_admin")).length;
};

const resolveTeamId = (req: NextRequest, ctx: Awaited<ReturnType<typeof getAppAccessContextFromRequest>>) => {
  const queryTeamId = String(new URL(req.url).searchParams.get("teamId") ?? "").trim();
  if (!queryTeamId) return ctx.team.id;
  assertTeamAccess(ctx, queryTeamId);
  return queryTeamId;
};

const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();

const normalizeDisplayName = (value: unknown) => String(value ?? "").trim();

const normalizePassword = (value: unknown) => String(value ?? "").trim();

const normalizeMemberPayload = (
  input: Record<string, unknown>,
): { ok: true; value: MemberCreatePayload } | { ok: false; error: string } => {
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.password);
  const displayName = normalizeDisplayName(input.displayName);
  const rawRole = String(input.role ?? "").trim();
  const parsedRole = sanitizeRoleInput(input.role);
  const role = parsedRole ?? "member";

  if (!email || !email.includes("@")) return { ok: false, error: "请输入有效邮箱" };
  if (!displayName) return { ok: false, error: "用户名不能为空" };
  if (password.length < 6) return { ok: false, error: "密码至少 6 位" };
  if (rawRole && !parsedRole) return { ok: false, error: "身份不合法，仅支持 member/admin/super_admin" };

  return {
    ok: true,
    value: {
      email,
      password,
      displayName,
      role,
    },
  };
};

const createMemberAccount = async (
  ctx: Awaited<ReturnType<typeof getAppAccessContextFromRequest>>,
  teamId: string,
  payload: MemberCreatePayload,
) => {
  if (payload.role !== "member") {
    requirePermission(ctx, "team.role.manage", "你没有设置成员角色的权限");
    if (payload.role === "super_admin" && !ctx.isSuperAdmin) {
      throw Object.assign(new Error("仅超级管理员可创建超级管理员"), { status: 403 });
    }
  }

  const createRes = await supabaseAdminAuthFetch("/admin/users", {
    method: "POST",
    body: {
      email: payload.email,
      password: payload.password,
      email_confirm: true,
    },
  });

  const createData = await readJsonSafe(createRes);
  if (!createRes.ok) {
    const msg = String(createData.msg ?? createData.error_description ?? createData.error ?? "创建账号失败");
    throw Object.assign(new Error(msg), { status: createRes.status });
  }

  const userId = String(
    (createData.user as { id?: unknown } | undefined)?.id ??
      (createData as { id?: unknown }).id ??
      (createData as { user_id?: unknown }).user_id ??
      "",
  ).trim();
  if (!userId) {
    throw new Error("创建账号失败：未获取到用户ID");
  }

  try {
    const profileRes = await supabaseAdminRestFetch("app_user_profiles", {
      method: "POST",
      body: { user_id: userId, display_name: payload.displayName.slice(0, 48) },
      prefer: "resolution=merge-duplicates,return=representation",
    });
    if (!profileRes.ok) throw new Error("创建用户资料失败");

    const memberRes = await supabaseAdminRestFetch("app_team_members", {
      method: "POST",
      body: {
        team_id: teamId,
        user_id: userId,
        role: payload.role,
        status: "active",
      },
      prefer: "return=representation",
    });
    const rows = await readSupabaseRestArray<TeamMemberRow>(memberRes, "创建团队成员失败");
    const member = rows[0];
    if (!member?.id) throw new Error("创建团队成员失败");

    return {
      id: member.id,
      userId: member.user_id,
      email: payload.email,
      displayName: payload.displayName,
      role: member.role,
      status: member.status,
      createdAt: member.created_at,
      updatedAt: member.updated_at,
    };
  } catch (error) {
    await supabaseAdminAuthFetch(`/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(() => null);
    throw error;
  }
};

const resolveTargetMember = async (opts: { memberId?: unknown; userId?: unknown; teamId: string }) => {
  const memberId = String(opts.memberId ?? "").trim();
  const userId = String(opts.userId ?? "").trim();

  if (memberId) {
    const res = await supabaseAdminRestFetch(
      `app_team_members?select=id,team_id,user_id,role,status,created_at,updated_at&id=eq.${encodeFilter(memberId)}&team_id=eq.${encodeFilter(opts.teamId)}&limit=1`,
      { method: "GET" },
    );
    const rows = await readSupabaseRestArray<TeamMemberRow>(res, "读取成员失败");
    return rows[0] ?? null;
  }

  if (userId) {
    const res = await supabaseAdminRestFetch(
      `app_team_members?select=id,team_id,user_id,role,status,created_at,updated_at&user_id=eq.${encodeFilter(userId)}&team_id=eq.${encodeFilter(opts.teamId)}&limit=1`,
      { method: "GET" },
    );
    const rows = await readSupabaseRestArray<TeamMemberRow>(res, "读取成员失败");
    return rows[0] ?? null;
  }

  return null;
};

const generateNumericPassword = (length = 8) => {
  const chars: string[] = [];
  const random = new Uint32Array(length);
  crypto.getRandomValues(random);
  for (const num of random) {
    chars.push(String(num % 10));
  }
  return chars.join("");
};

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "team.member.read", "你没有查看成员列表的权限");
    const teamId = resolveTeamId(req, ctx);

    const members = await listTeamMembersByTeamId(teamId);
    const [profiles, permissionRows, authUsers] = await Promise.all([
      listProfilesByUserIds(members.map((m) => m.user_id)),
      listPermissionOverridesByTeamId(teamId),
      listAuthUsers(),
    ]);

    const profileMap = new Map(profiles.map((p: ProfileRow) => [p.user_id, p]));
    const userMap = new Map(authUsers.map((u) => [u.id, u]));
    const permissionMap = new Map<string, PermissionRow[]>();
    for (const row of permissionRows as PermissionRow[]) {
      const list = permissionMap.get(row.user_id) ?? [];
      list.push(row);
      permissionMap.set(row.user_id, list);
    }

    return NextResponse.json({
      members: (members as TeamMemberRow[]).map((member) => ({
        id: member.id,
        userId: member.user_id,
        role: member.role,
        status: member.status,
        displayName: profileMap.get(member.user_id)?.display_name || "",
        email: userMap.get(member.user_id)?.email || "",
        permissions: (permissionMap.get(member.user_id) ?? []).map((p) => ({
          id: p.id,
          permKey: p.perm_key,
          enabled: p.enabled,
          expiresAt: p.expires_at,
        })),
        createdAt: member.created_at,
        updatedAt: member.updated_at,
      })),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "读取成员列表失败") }, { status: toStatus(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "team.member.manage", "你没有新增成员的权限");

    const teamId = resolveTeamId(req, ctx);
    const body = (await req.json().catch(() => ({}))) as {
      email?: unknown;
      password?: unknown;
      displayName?: unknown;
      role?: unknown;
      members?: unknown;
    };

    if (Array.isArray(body.members)) {
      const inputList = body.members as Array<Record<string, unknown>>;
      if (inputList.length === 0) {
        return NextResponse.json({ error: "请至少填写一条导入记录" }, { status: 400 });
      }
      if (inputList.length > MAX_BATCH_IMPORT) {
        return NextResponse.json({ error: `单次最多导入 ${MAX_BATCH_IMPORT} 条` }, { status: 400 });
      }

      const failures: Array<{ index: number; email: string; reason: string }> = [];
      const created: Array<{
        id: string;
        userId: string;
        email: string;
        displayName: string;
        role: "super_admin" | "admin" | "member";
        status: "active" | "disabled";
        createdAt: string;
        updatedAt: string;
      }> = [];

      const seenEmails = new Set<string>();
      for (let i = 0; i < inputList.length; i++) {
        const row = inputList[i] ?? {};
        const normalized = normalizeMemberPayload(row);
        const email = normalizeEmail((row as { email?: unknown }).email);
        if (!normalized.ok) {
          failures.push({ index: i + 1, email, reason: normalized.error });
          continue;
        }
        if (seenEmails.has(normalized.value.email)) {
          failures.push({ index: i + 1, email: normalized.value.email, reason: "导入列表中存在重复邮箱" });
          continue;
        }
        seenEmails.add(normalized.value.email);

        try {
          const member = await createMemberAccount(ctx, teamId, normalized.value);
          created.push(member);
        } catch (error) {
          failures.push({ index: i + 1, email: normalized.value.email, reason: toMessage(error, "新增成员失败") });
        }
      }

      return NextResponse.json({
        success: failures.length === 0,
        batch: true,
        total: inputList.length,
        createdCount: created.length,
        failedCount: failures.length,
        created,
        failures,
      });
    }

    const normalized = normalizeMemberPayload(body as Record<string, unknown>);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const member = await createMemberAccount(ctx, teamId, normalized.value);
    return NextResponse.json({ success: true, member });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "新增成员失败") }, { status: toStatus(error) });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "team.member.manage", "你没有管理成员的权限");

    const teamId = resolveTeamId(req, ctx);
    const body = (await req.json().catch(() => ({}))) as {
      memberId?: unknown;
      userId?: unknown;
      displayName?: unknown;
      role?: unknown;
      status?: unknown;
      email?: unknown;
      password?: unknown;
      action?: unknown;
    };

    const target = await resolveTargetMember({ memberId: body.memberId, userId: body.userId, teamId });
    if (!target?.id) return NextResponse.json({ error: "未找到成员" }, { status: 404 });

    if (target.role === "super_admin" && !ctx.isSuperAdmin) {
      return NextResponse.json({ error: "仅超级管理员可修改超级管理员" }, { status: 403 });
    }

    const action = String(body.action ?? "").trim();
    if (action) {
      if (action === "reset_password") {
        if (target.user_id === ctx.user.id) {
          return NextResponse.json({ error: "请在账号中心修改自己的密码" }, { status: 400 });
        }
        const password = generateNumericPassword(8);
        await resetAuthUserPassword(target.user_id, password);
        return NextResponse.json({ success: true, action: "reset_password", password });
      }

      if (action === "delete_account") {
        if (target.user_id === ctx.user.id) return NextResponse.json({ error: "不能在此处注销自己" }, { status: 400 });
        if (target.user_id === ctx.team.ownerUserId) {
          return NextResponse.json({ error: "不能在团队管理中注销团队所有者账号" }, { status: 400 });
        }

        const allMembers = (await listTeamMembersByTeamId(teamId)) as TeamMemberRow[];
        const nextMembers = allMembers.filter((m) => m.id !== target.id);
        if (countActiveAdmins(nextMembers) < 1) {
          return NextResponse.json({ error: "团队至少需要保留一个管理员" }, { status: 400 });
        }

        await hardDeleteAccountByUserId(target.user_id);
        return NextResponse.json({ success: true, action: "delete_account" });
      }

      return NextResponse.json({ error: "不支持的操作类型" }, { status: 400 });
    }

    if (target.user_id === ctx.user.id && (body.role !== undefined || body.status !== undefined)) {
      return NextResponse.json({ error: "不能在此处修改自己的角色或状态" }, { status: 400 });
    }

    const role = body.role !== undefined ? sanitizeRoleInput(body.role) : null;
    const status = body.status !== undefined ? sanitizeStatusInput(body.status) : null;

    if (body.role !== undefined) {
      if (!role) return NextResponse.json({ error: "无效角色" }, { status: 400 });
      requirePermission(ctx, "team.role.manage", "你没有变更角色的权限");
      if (role === "super_admin" && !ctx.isSuperAdmin) {
        return NextResponse.json({ error: "仅超级管理员可设置超级管理员" }, { status: 403 });
      }
    }

    if (body.status !== undefined && !status) {
      return NextResponse.json({ error: "无效状态" }, { status: 400 });
    }

    const allMembers = (await listTeamMembersByTeamId(teamId)) as TeamMemberRow[];
    const nextRole = role ?? target.role;
    const nextStatus = status ?? target.status;
    const nextMembers = allMembers.map((m) =>
      m.id === target?.id ? { ...m, role: nextRole, status: nextStatus } : m,
    );
    if (countActiveAdmins(nextMembers) < 1) {
      return NextResponse.json({ error: "团队至少需要保留一个管理员" }, { status: 400 });
    }

    if (role || status) {
      const patch: Record<string, unknown> = {};
      if (role) patch.role = role;
      if (status) patch.status = status;
      const memberRes = await supabaseAdminRestFetch(`app_team_members?id=eq.${encodeFilter(target.id)}`, {
        method: "PATCH",
        body: patch,
        prefer: "return=minimal",
      });
      if (!memberRes.ok) throw new Error("更新成员角色/状态失败");
    }

    const displayName = body.displayName !== undefined ? String(body.displayName ?? "").trim() : "";
    if (body.displayName !== undefined) {
      if (!displayName) return NextResponse.json({ error: "用户名不能为空" }, { status: 400 });
      const profileRes = await supabaseAdminRestFetch(`app_user_profiles?user_id=eq.${encodeFilter(target.user_id)}`, {
        method: "PATCH",
        body: { display_name: displayName.slice(0, 48) },
        prefer: "return=minimal",
      });
      if (!profileRes.ok) throw new Error("更新用户名失败");
    }

    const email = body.email !== undefined ? String(body.email ?? "").trim().toLowerCase() : "";
    const password = body.password !== undefined ? String(body.password ?? "").trim() : "";
    if (body.password !== undefined && password.length < 6) {
      return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
    }

    if (body.email !== undefined || body.password !== undefined) {
      const payload: Record<string, unknown> = {};
      if (body.email !== undefined) {
        if (!email || !email.includes("@")) return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
        payload.email = email;
      }
      if (body.password !== undefined) payload.password = password;

      const authRes = await supabaseAdminAuthFetch(`/admin/users/${encodeURIComponent(target.user_id)}`, {
        method: "PUT",
        body: payload,
      });
      if (!authRes.ok) {
        const authData = await readJsonSafe(authRes);
        const msg = String(authData.msg ?? authData.error_description ?? authData.error ?? "更新账号信息失败");
        return NextResponse.json({ error: msg }, { status: authRes.status });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "更新成员失败") }, { status: toStatus(error) });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "team.member.manage", "你没有删除成员的权限");

    const teamId = resolveTeamId(req, ctx);
    const { searchParams } = new URL(req.url);
    const memberId = String(searchParams.get("memberId") ?? "").trim();
    if (!memberId) return NextResponse.json({ error: "缺少 memberId" }, { status: 400 });

    const target = await resolveTargetMember({ memberId, teamId });
    if (!target?.id) return NextResponse.json({ error: "未找到成员" }, { status: 404 });

    if (target.user_id === ctx.user.id) return NextResponse.json({ error: "不能删除自己" }, { status: 400 });
    if (target.role === "super_admin" && !ctx.isSuperAdmin) {
      return NextResponse.json({ error: "仅超级管理员可删除超级管理员" }, { status: 403 });
    }
    if (target.user_id === ctx.team.ownerUserId) {
      return NextResponse.json({ error: "不能在团队管理中注销团队所有者账号" }, { status: 400 });
    }

    const allMembers = (await listTeamMembersByTeamId(teamId)) as TeamMemberRow[];
    const nextMembers = allMembers.filter((m) => m.id !== target.id);
    if (countActiveAdmins(nextMembers) < 1) {
      return NextResponse.json({ error: "团队至少需要保留一个管理员" }, { status: 400 });
    }

    await hardDeleteAccountByUserId(target.user_id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "删除成员失败") }, { status: toStatus(error) });
  }
}
