import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase";
import { createUserShare, listUserShares, type ShareCreateInput } from "@/lib/shares";
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
    const auth = await requireSupabaseUser(req);
    const shares = await listUserShares(auth.token);
    const origin = new URL(req.url).origin;
    return NextResponse.json({ shares: shares.map((s) => withShareUrl(origin, s)) });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSupabaseUser(req);
    const body = (await req.json()) as ShareCreateInput;
    const share = await createUserShare(auth.token, body);
    const origin = new URL(req.url).origin;
    return NextResponse.json({ share: withShareUrl(origin, share) });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}
