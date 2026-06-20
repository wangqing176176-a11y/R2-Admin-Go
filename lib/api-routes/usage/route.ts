import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, requirePermission } from "@/lib/access-control";
import { createR2Bucket } from "@/lib/r2-s3";
import { resolveBucketCredentials } from "@/lib/user-buckets";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const parsePositiveInt = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => toChineseErrorMessage(error, "读取存储桶占用信息失败，请稍后重试。");

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "usage.read", "你没有查看容量统计的权限");

    const { searchParams } = new URL(req.url);
    const bucketId = searchParams.get("bucket");
    const prefix = searchParams.get("prefix") ?? "";
    const maxPages = parsePositiveInt(searchParams.get("maxPages"), 10);

    if (!bucketId) return NextResponse.json({ error: "缺少存储桶参数" }, { status: 400 });

    const { creds } = await resolveBucketCredentials(ctx, bucketId);
    const bucket = createR2Bucket(creds);

    let pagesScanned = 0;
    let objects = 0;
    let bytes = 0;
    let truncated = false;

    let cursor: string | undefined = undefined;
    for (;;) {
      pagesScanned += 1;
      const res = await bucket.list({ prefix, cursor });
      for (const o of res.objects ?? []) {
        objects += 1;
        bytes += o.size ?? 0;
      }
      if (!res.truncated) break;
      if (pagesScanned >= maxPages) {
        truncated = true;
        break;
      }
      cursor = res.cursor;
      if (!cursor) break;
    }

    return NextResponse.json({ bucket: bucketId, prefix, objects, bytes, pagesScanned, truncated });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}
