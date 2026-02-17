import { NextRequest, NextResponse } from "next/server";
import { getPublicShareRow, ensurePublicShareReady, verifySharePasscode } from "@/lib/shares";
import { issueShareAccessToken } from "@/lib/share-token";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const json = (status: number, obj: unknown) => NextResponse.json(obj, { status });

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { code?: string; passcode?: string };
    const code = String(body.code ?? "").trim();
    if (!code) return json(400, { error: "缺少分享码" });

    const row = await getPublicShareRow(code);
    if (!row) return json(404, { error: "分享不存在或已失效" });

    const meta = ensurePublicShareReady(row);

    if (meta.passcodeEnabled) {
      const passcode = String(body.passcode ?? "").trim();
      const ok = await verifySharePasscode(row, passcode);
      if (!ok) return json(400, { error: "提取码错误，请重试。" });
    }

    const accessToken = await issueShareAccessToken(
      {
        shareId: row.id,
        shareCode: row.share_code,
      },
      12 * 3600,
    );

    return json(200, {
      accessToken,
      expiresIn: 12 * 3600,
      meta,
    });
  } catch (error: unknown) {
    const msg = toChineseErrorMessage(error, "校验提取码失败，请稍后重试。");
    return json(400, { error: msg || "校验提取码失败" });
  }
}
