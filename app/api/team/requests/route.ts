import { NextRequest, NextResponse } from "next/server";
import {
  assertTeamAccess,
  getAppAccessContextFromRequest,
  listProfilesByUserIds,
  requirePermission,
  sanitizePermissionInput,
  upsertPermissionOverride,
} from "@/lib/access-control";
import { readSupabaseRestArray, supabaseAdminAuthFetch, supabaseAdminRestFetch } from "@/lib/supabase";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

type RequestRow = {
  id: string;
  team_id: string;
  user_id: string;
  perm_key: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "canceled";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  user_id: string;
  display_name: string;
};

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
  return usersRaw
    .map((u) => ({
      id: String((u as { id?: unknown }).id ?? "").trim(),
      email: String((u as { email?: unknown }).email ?? "").trim(),
    }))
    .filter((u) => u.id);
};

const encodeFilter = (value: string) => encodeURIComponent(value);

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown, fallback: string) => toChineseErrorMessage(error, fallback);

const resolveTeamId = (req: NextRequest, ctx: Awaited<ReturnType<typeof getAppAccessContextFromRequest>>) => {
  const queryTeamId = String(new URL(req.url).searchParams.get("teamId") ?? "").trim();
  if (!queryTeamId) return ctx.team.id;
  assertTeamAccess(ctx, queryTeamId);
  return queryTeamId;
};

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    const teamId = resolveTeamId(req, ctx);

    const canReview = ctx.permissions.has("team.permission.request.review");
    const query = canReview
      ? `app_permission_requests?select=id,team_id,user_id,perm_key,reason,status,reviewed_by,reviewed_at,created_at,updated_at&team_id=eq.${encodeFilter(
          teamId,
        )}&order=created_at.desc`
      : `app_permission_requests?select=id,team_id,user_id,perm_key,reason,status,reviewed_by,reviewed_at,created_at,updated_at&team_id=eq.${encodeFilter(
          teamId,
        )}&user_id=eq.${encodeFilter(ctx.user.id)}&order=created_at.desc`;

    const res = await supabaseAdminRestFetch(query, { method: "GET" });
    const rows = await readSupabaseRestArray<RequestRow>(res, "读取权限申请失败");
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    const [profiles, authUsers] = await Promise.all([
      listProfilesByUserIds(userIds),
      listAuthUsers(),
    ]);
    const profileMap = new Map((profiles as ProfileRow[]).map((p) => [p.user_id, p]));
    const userMap = new Map(authUsers.map((u) => [u.id, u]));

    return NextResponse.json({
      requests: rows.map((row) => ({
        id: row.id,
        teamId: row.team_id,
        userId: row.user_id,
        permKey: row.perm_key,
        reason: row.reason ?? "",
        status: row.status,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at,
        requesterDisplayName: profileMap.get(row.user_id)?.display_name || "",
        requesterEmail: userMap.get(row.user_id)?.email || "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "读取权限申请失败") }, { status: toStatus(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "team.permission.request.create", "你没有提交权限申请的权限");

    const body = (await req.json().catch(() => ({}))) as { permKey?: unknown; reason?: unknown };
    const permKey = sanitizePermissionInput(body.permKey);
    const reason = String(body.reason ?? "").trim().slice(0, 300);

    if (!permKey) return NextResponse.json({ error: "无效权限键" }, { status: 400 });

    const query = `app_permission_requests?select=id,team_id,user_id,perm_key,reason,status,reviewed_by,reviewed_at,created_at,updated_at&team_id=eq.${encodeFilter(
      ctx.team.id,
    )}&user_id=eq.${encodeFilter(ctx.user.id)}&perm_key=eq.${encodeFilter(permKey)}&status=eq.pending&limit=1`;
    const existsRes = await supabaseAdminRestFetch(query, { method: "GET" });
    const existing = await readSupabaseRestArray<RequestRow>(existsRes, "读取申请状态失败");
    if (existing[0]?.id) {
      return NextResponse.json({ error: "该权限已存在待审批申请" }, { status: 400 });
    }

    const createRes = await supabaseAdminRestFetch("app_permission_requests", {
      method: "POST",
      body: {
        team_id: ctx.team.id,
        user_id: ctx.user.id,
        perm_key: permKey,
        reason: reason || null,
        status: "pending",
      },
      prefer: "return=representation",
    });
    const rows = await readSupabaseRestArray<RequestRow>(createRes, "提交权限申请失败");
    const row = rows[0];
    if (!row?.id) throw new Error("提交权限申请失败");

    return NextResponse.json({
      success: true,
      request: {
        id: row.id,
        permKey: row.perm_key,
        status: row.status,
        reason: row.reason ?? "",
        createdAt: row.created_at,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "提交权限申请失败") }, { status: toStatus(error) });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "team.permission.request.review", "你没有审批权限申请的权限");

    const body = (await req.json().catch(() => ({}))) as {
      id?: unknown;
      status?: unknown;
      teamId?: unknown;
      expiresAt?: unknown;
    };
    const id = String(body.id ?? "").trim();
    const status = String(body.status ?? "").trim();
    const teamId = String(body.teamId ?? "").trim() || ctx.team.id;
    assertTeamAccess(ctx, teamId);

    if (!id) return NextResponse.json({ error: "缺少申请 ID" }, { status: 400 });
    if (status !== "approved" && status !== "rejected" && status !== "canceled") {
      return NextResponse.json({ error: "无效状态" }, { status: 400 });
    }

    const findRes = await supabaseAdminRestFetch(
      `app_permission_requests?select=id,team_id,user_id,perm_key,reason,status,reviewed_by,reviewed_at,created_at,updated_at&id=eq.${encodeFilter(
        id,
      )}&team_id=eq.${encodeFilter(teamId)}&limit=1`,
      { method: "GET" },
    );
    const found = await readSupabaseRestArray<RequestRow>(findRes, "读取权限申请失败");
    const target = found[0];
    if (!target?.id) return NextResponse.json({ error: "申请不存在" }, { status: 404 });

    const patchRes = await supabaseAdminRestFetch(`app_permission_requests?id=eq.${encodeFilter(target.id)}`, {
      method: "PATCH",
      body: {
        status,
        reviewed_by: ctx.user.id,
        reviewed_at: new Date().toISOString(),
      },
      prefer: "return=representation",
    });
    const updated = await readSupabaseRestArray<RequestRow>(patchRes, "审批权限申请失败");
    const row = updated[0];
    if (!row?.id) throw new Error("审批权限申请失败");

    if (status === "approved") {
      const permKey = sanitizePermissionInput(target.perm_key);
      if (permKey) {
        const expiresAtRaw = String(body.expiresAt ?? "").trim();
        const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).toISOString() : null;
        await upsertPermissionOverride({
          teamId,
          userId: target.user_id,
          permKey,
          enabled: true,
          expiresAt,
          grantedBy: ctx.user.id,
        });
      }
    }

    return NextResponse.json({
      success: true,
      request: {
        id: row.id,
        status: row.status,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "审批权限申请失败") }, { status: toStatus(error) });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    const teamId = resolveTeamId(req, ctx);
    const scopeRaw = String(new URL(req.url).searchParams.get("scope") ?? "").trim();
    const scope = scopeRaw === "team" ? "team" : "self";

    if (scope === "team") {
      requirePermission(ctx, "team.permission.request.review", "你没有清除团队审批记录的权限");
    }

    const deleteQuery =
      scope === "team"
        ? `app_permission_requests?team_id=eq.${encodeFilter(teamId)}&status=eq.approved`
        : `app_permission_requests?team_id=eq.${encodeFilter(teamId)}&user_id=eq.${encodeFilter(
            ctx.user.id,
          )}&status=eq.approved`;
    const deleteRes = await supabaseAdminRestFetch(deleteQuery, {
      method: "DELETE",
      prefer: "return=representation",
    });
    const deletedRows = await readSupabaseRestArray<RequestRow>(deleteRes, "清除已批准申请失败");

    return NextResponse.json({
      success: true,
      deleted: deletedRows.length,
      scope,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "清除已批准申请失败") }, { status: toStatus(error) });
  }
}
