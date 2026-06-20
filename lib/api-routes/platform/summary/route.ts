import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, listAllTeams, requirePermission } from "@/lib/access-control";
import { readSupabaseRestArray, supabaseAdminRestFetch } from "@/lib/supabase";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

type MemberMini = { team_id: string; role: string; status: string };
type BucketMini = { team_id: string };
type RequestMini = { team_id: string; status: string };

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown, fallback: string) => toChineseErrorMessage(error, fallback);

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "sys.metrics.read", "你没有查看平台统计的权限");

    const [teams, members, buckets, requests] = await Promise.all([
      listAllTeams(),
      (async () => {
        const res = await supabaseAdminRestFetch("app_team_members?select=team_id,role,status", { method: "GET" });
        return await readSupabaseRestArray<MemberMini>(res, "读取团队成员失败");
      })(),
      (async () => {
        const res = await supabaseAdminRestFetch("user_r2_buckets?select=team_id", { method: "GET" });
        return await readSupabaseRestArray<BucketMini>(res, "读取桶统计失败");
      })(),
      (async () => {
        const res = await supabaseAdminRestFetch("app_permission_requests?select=team_id,status", { method: "GET" });
        return await readSupabaseRestArray<RequestMini>(res, "读取申请统计失败");
      })(),
    ]);

    const memberCountMap = new Map<string, number>();
    const adminCountMap = new Map<string, number>();
    for (const member of members) {
      memberCountMap.set(member.team_id, (memberCountMap.get(member.team_id) ?? 0) + 1);
      if (member.status === "active" && (member.role === "admin" || member.role === "super_admin")) {
        adminCountMap.set(member.team_id, (adminCountMap.get(member.team_id) ?? 0) + 1);
      }
    }

    const bucketCountMap = new Map<string, number>();
    for (const bucket of buckets) {
      bucketCountMap.set(bucket.team_id, (bucketCountMap.get(bucket.team_id) ?? 0) + 1);
    }

    const pendingMap = new Map<string, number>();
    for (const r of requests) {
      if (r.status !== "pending") continue;
      pendingMap.set(r.team_id, (pendingMap.get(r.team_id) ?? 0) + 1);
    }

    const teamList = teams.map((team) => ({
      id: team.id,
      name: team.name,
      ownerUserId: team.owner_user_id,
      members: memberCountMap.get(team.id) ?? 0,
      admins: adminCountMap.get(team.id) ?? 0,
      buckets: bucketCountMap.get(team.id) ?? 0,
      pendingRequests: pendingMap.get(team.id) ?? 0,
      createdAt: team.created_at,
      updatedAt: team.updated_at,
    }));

    return NextResponse.json({
      totals: {
        teams: teamList.length,
        members: members.length,
        buckets: buckets.length,
        pendingRequests: requests.filter((r) => r.status === "pending").length,
      },
      teams: teamList,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "读取平台统计失败") }, { status: toStatus(error) });
  }
}
