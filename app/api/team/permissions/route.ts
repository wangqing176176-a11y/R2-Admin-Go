import { NextRequest, NextResponse } from "next/server";
import {
  assertTeamAccess,
  getAppAccessContextFromRequest,
  listPermissionOverridesByTeamId,
  listTeamMembersByTeamId,
  requirePermission,
  sanitizePermissionInput,
  upsertPermissionOverride,
} from "@/lib/access-control";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

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
    requirePermission(ctx, "team.member.read", "你没有查看权限配置的权限");

    const teamId = resolveTeamId(req, ctx);
    const userId = String(new URL(req.url).searchParams.get("userId") ?? "").trim();

    const rows = await listPermissionOverridesByTeamId(teamId);
    const filtered = userId ? rows.filter((r) => r.user_id === userId) : rows;

    return NextResponse.json({
      permissions: filtered.map((r) => ({
        id: r.id,
        teamId: r.team_id,
        userId: r.user_id,
        permKey: r.perm_key,
        enabled: r.enabled,
        expiresAt: r.expires_at,
      })),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "读取权限配置失败") }, { status: toStatus(error) });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "team.permission.grant", "你没有修改成员权限的权限");

    const teamId = resolveTeamId(req, ctx);
    const body = (await req.json().catch(() => ({}))) as {
      userId?: unknown;
      permKey?: unknown;
      enabled?: unknown;
      expiresAt?: unknown;
    };

    const userId = String(body.userId ?? "").trim();
    const permKey = sanitizePermissionInput(body.permKey);
    const enabled = Boolean(body.enabled);
    const expiresAtRaw = String(body.expiresAt ?? "").trim();
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).toISOString() : null;

    if (!userId) return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
    if (!permKey) return NextResponse.json({ error: "无效权限键" }, { status: 400 });

    const members = await listTeamMembersByTeamId(teamId);
    const target = members.find((m) => m.user_id === userId);
    if (!target) return NextResponse.json({ error: "成员不存在" }, { status: 404 });
    if (target.role === "super_admin" && !ctx.isSuperAdmin) {
      return NextResponse.json({ error: "仅超级管理员可修改超级管理员权限" }, { status: 403 });
    }

    const row = await upsertPermissionOverride({
      teamId,
      userId,
      permKey,
      enabled,
      expiresAt,
      grantedBy: ctx.user.id,
    });

    return NextResponse.json({
      success: true,
      permission: {
        id: row.id,
        userId: row.user_id,
        permKey: row.perm_key,
        enabled: row.enabled,
        expiresAt: row.expires_at,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "更新权限配置失败") }, { status: toStatus(error) });
  }
}
