import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const params = await ctx.params;
  const code = String(params.code ?? "").trim();
  const url = new URL(req.url);
  url.pathname = "/s";
  if (code) url.searchParams.set("code", code);
  return NextResponse.redirect(url, { status: 307 });
}
