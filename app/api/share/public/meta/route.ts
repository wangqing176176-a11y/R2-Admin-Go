import { NextRequest, NextResponse } from "next/server";
import { getPublicShareRow, ensurePublicShareReady, resolvePublicShareCredentials } from "@/lib/shares";
import { createR2Bucket } from "@/lib/r2-s3";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const json = (status: number, obj: unknown) => NextResponse.json(obj, { status });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = String(searchParams.get("code") ?? "").trim();
    if (!code) return json(400, { error: "缺少分享码" });

    const row = await getPublicShareRow(code);
    if (!row) return json(404, { error: "分享不存在或已失效" });

    const meta = ensurePublicShareReady(row);

    if (meta.itemType === "file") {
      try {
        const creds = await resolvePublicShareCredentials(row);
        const bucket = createR2Bucket(creds);
        const head = await bucket.head(meta.itemKey);
        if (head) {
          return json(200, {
            meta: {
              ...meta,
              size: head.size ?? null,
            },
          });
        }
      } catch {
        // ignore meta enrichment error
      }
    }

    return json(200, { meta });
  } catch (error: unknown) {
    const msg = toChineseErrorMessage(error, "读取分享信息失败，请稍后重试。");
    return json(400, { error: msg || "读取分享信息失败" });
  }
}
