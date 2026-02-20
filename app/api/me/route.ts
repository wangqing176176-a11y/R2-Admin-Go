import { NextRequest, NextResponse } from "next/server";
import {
  countRows,
  getAppAccessContextFromRequest,
  requirePermission,
  updateOwnDisplayName,
} from "@/lib/access-control";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown, fallback: string) => toChineseErrorMessage(error, fallback);

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    const encodedTeam = encodeURIComponent(ctx.team.id);

    const [bucketCount, teamMemberCount, pendingRequestCount] = await Promise.all([
      countRows("user_r2_buckets", `team_id=eq.${encodedTeam}`),
      countRows("app_team_members", `team_id=eq.${encodedTeam}`),
      countRows("app_permission_requests", `team_id=eq.${encodedTeam}&status=eq.pending`),
    ]);

    return NextResponse.json({
      profile: {
        userId: ctx.user.id,
        email: ctx.user.email ?? "",
        displayName: ctx.displayName,
        role: ctx.role,
        roleLabel: ctx.roleLabel,
        status: ctx.status,
      },
      team: {
        id: ctx.team.id,
        name: ctx.team.name,
        ownerUserId: ctx.team.ownerUserId,
      },
      permissions: ctx.permissionList,
      stats: {
        bucketCount,
        teamMemberCount,
        pendingRequestCount,
      },
      features: {
        canOpenTeamConsole: ctx.permissions.has("team.member.read"),
        canOpenPlatformConsole: ctx.permissions.has("sys.metrics.read"),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "读取账号信息失败") }, { status: toStatus(error) });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "account.self.manage", "你没有修改个人资料的权限");

    const body = (await req.json().catch(() => ({}))) as { displayName?: unknown };
    const displayName = String(body.displayName ?? "").trim();
    if (!displayName) {
      return NextResponse.json({ error: "用户名不能为空" }, { status: 400 });
    }

    const row = await updateOwnDisplayName(ctx, displayName);
    return NextResponse.json({
      success: true,
      profile: {
        userId: row.user_id,
        displayName: row.display_name,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "更新用户名失败") }, { status: toStatus(error) });
  }
}
