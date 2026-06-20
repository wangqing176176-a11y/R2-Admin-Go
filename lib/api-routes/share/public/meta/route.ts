import { NextRequest, NextResponse } from "next/server";
import { getPublicShareRow, ensurePublicShareReady, resolvePublicShareCredentials, assertPublicShareNotLocked } from "@/lib/shares";
import { createR2Bucket } from "@/lib/r2-s3";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const json = (status: number, obj: unknown) => NextResponse.json(obj, { status });

const resolveObjectSize = async (
  bucket: ReturnType<typeof createR2Bucket>,
  key: string,
  primary?: number | null,
): Promise<number | undefined> => {
  if (typeof primary === "number" && Number.isFinite(primary) && primary >= 0) return primary;
  try {
    const listed = await bucket.list({ prefix: key, limit: 10 });
    const exact = (listed.objects ?? []).find((item) => item.key === key);
    if (typeof exact?.size === "number" && Number.isFinite(exact.size) && exact.size >= 0) {
      return exact.size;
    }
  } catch {
    // ignore size fallback error
  }
  return undefined;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = String(searchParams.get("code") ?? "").trim();
    if (!code) return json(400, { error: "缺少分享码" });

    const row = await getPublicShareRow(code);
    if (!row) return json(404, { error: "分享不存在或已失效" });
    await assertPublicShareNotLocked(row);

    const meta = ensurePublicShareReady(row);

    if (meta.itemType === "file") {
      try {
        const creds = await resolvePublicShareCredentials(row);
        const bucket = createR2Bucket(creds);
        const head = await bucket.head(meta.itemKey);
        const size = await resolveObjectSize(bucket, meta.itemKey, head?.size);
        if (typeof size === "number") {
          return json(200, {
            meta: {
              ...meta,
              size,
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
