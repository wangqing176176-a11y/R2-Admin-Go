import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, invalidateAppAccessContextCache, requirePermission } from "@/lib/access-control";
import { toChineseErrorMessage } from "@/lib/error-zh";
import { supabaseAdminRestFetch } from "@/lib/supabase";

export const runtime = "edge";

const encodeFilter = (value: string) => encodeURIComponent(value);

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown, fallback: string) => toChineseErrorMessage(error, fallback);

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "team.member.manage", "你没有修改团队设置的权限");

    const body = (await req.json().catch(() => ({}))) as { name?: unknown };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "团队名称不能为空" }, { status: 400 });
    }
    if (name.length > 48) {
      return NextResponse.json({ error: "团队名称不能超过 48 个字符" }, { status: 400 });
    }

    const res = await supabaseAdminRestFetch(`app_teams?id=eq.${encodeFilter(ctx.team.id)}`, {
      method: "PATCH",
      body: { name },
      prefer: "return=minimal",
    });
    if (!res.ok) throw new Error("更新团队名称失败");
    invalidateAppAccessContextCache(ctx.token);

    return NextResponse.json({
      success: true,
      team: {
        id: ctx.team.id,
        name,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "更新团队设置失败") }, { status: toStatus(error) });
  }
}
