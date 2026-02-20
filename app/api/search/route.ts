import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, requirePermission } from "@/lib/access-control";
import { createR2Bucket } from "@/lib/r2-s3";
import { resolveBucketCredentials } from "@/lib/user-buckets";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const json = (status: number, obj: unknown) => NextResponse.json(obj, { status });

type SearchItem = {
  name: string;
  key: string;
  size?: number;
  lastModified?: string;
  type: "file";
};

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => toChineseErrorMessage(error, "搜索失败，请稍后重试。");

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "object.search", "你没有搜索文件的权限");

    const { searchParams } = new URL(req.url);
    const bucketId = searchParams.get("bucket");
    const qRaw = searchParams.get("q") ?? "";
    const startCursor = searchParams.get("cursor") ?? undefined;
    const limitRaw = searchParams.get("limit") ?? "200";

    if (!bucketId) return json(400, { error: "缺少存储桶参数" });

    const q = qRaw.trim().toLowerCase();
    if (!q) return json(200, { items: [], cursor: null });

    const limit = Math.max(1, Math.min(500, Number.parseInt(limitRaw, 10) || 200));
    const { creds } = await resolveBucketCredentials(ctx, bucketId);
    const bucket = createR2Bucket(creds);

    const items: SearchItem[] = [];
    let cursor: string | undefined = startCursor;
    let outCursor: string | null = null;
    let pages = 0;

    while (items.length < limit && pages < 25) {
      const res = await bucket.list({ cursor, limit: 1000 });
      for (const o of res.objects ?? []) {
        if (items.length >= limit) break;
        const key = String(o.key);
        if (key.endsWith("/") && Number(o.size ?? 0) === 0) continue;
        if (!key.toLowerCase().includes(q)) continue;
        items.push({
          name: key.split("/").pop() || key,
          key,
          size: o.size,
          lastModified: o.uploaded,
          type: "file",
        });
      }

      if (!res.truncated) {
        outCursor = null;
        break;
      }

      cursor = res.cursor;
      outCursor = cursor ?? null;
      if (!cursor) break;
      pages += 1;
    }

    return json(200, { items, cursor: outCursor });
  } catch (error: unknown) {
    return json(toStatus(error), { error: toMessage(error) });
  }
}
