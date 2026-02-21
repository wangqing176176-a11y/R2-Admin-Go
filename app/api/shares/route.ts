import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, requirePermission } from "@/lib/access-control";
import { cleanupExpiredSharesNow, cleanupStoppedSharesNow, createUserShare, listUserShares, type ShareCreateInput } from "@/lib/shares";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => toChineseErrorMessage(error, "分享操作失败，请稍后重试。");

const withShareUrl = (origin: string, row: { shareCode: string } & Record<string, unknown>) => ({
  ...row,
  shareUrl: `${origin}/s/${encodeURIComponent(row.shareCode)}`,
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "share.manage", "你没有查看分享管理的权限");
    const shares = await listUserShares(ctx);
    const origin = new URL(req.url).origin;
    return NextResponse.json({ shares: shares.map((s) => withShareUrl(origin, s)) });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "share.manage", "你没有分享权限");
    const body = (await req.json()) as ShareCreateInput;
    const share = await createUserShare(ctx, body);
    const origin = new URL(req.url).origin;
    return NextResponse.json({ share: withShareUrl(origin, share) });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "share.manage", "你没有分享权限");
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const action = String(body.action ?? "").trim();
    if (action !== "cleanup_stopped_now" && action !== "cleanup_expired_now") {
      return NextResponse.json({ error: "无效操作" }, { status: 400 });
    }

    const removed = action === "cleanup_expired_now" ? await cleanupExpiredSharesNow(ctx) : await cleanupStoppedSharesNow(ctx);
    return NextResponse.json({ removed });
  } catch (error: unknown) {
    return NextResponse.json({ error: toChineseErrorMessage(error, "清理分享记录失败，请稍后重试。") }, { status: toStatus(error) });
  }
}
