import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase";
import { stopUserShare } from "@/lib/shares";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => toChineseErrorMessage(error, "分享操作失败，请稍后重试。");

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSupabaseUser(req);
    const params = await ctx.params;
    const shareId = String(params.id ?? "").trim();
    if (!shareId) return NextResponse.json({ error: "缺少分享 ID" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const action = String(body.action ?? "stop").trim();
    if (action !== "stop") {
      return NextResponse.json({ error: "无效操作" }, { status: 400 });
    }

    const share = await stopUserShare(auth.token, shareId);
    return NextResponse.json({ share });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}
