import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, requirePermission } from "@/lib/access-control";
import { createR2Bucket, getPresignedObjectUrl } from "@/lib/r2-s3";
import { issueRouteToken, readRouteToken, type MultipartRouteToken } from "@/lib/route-token";
import { resolveBucketCredentials } from "@/lib/user-buckets";
import { toChineseErrorMessage } from "@/lib/error-zh";
import { assertFolderUnlockedForPath } from "@/lib/folder-locks";

export const runtime = "edge";

type Action = "create" | "signPart" | "complete" | "abort";

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => toChineseErrorMessage(error, "分片上传操作失败，请稍后重试。");

const resolveBucket = async (req: NextRequest, bucketId: string, key?: string) => {
  const ctx = await getAppAccessContextFromRequest(req);
  requirePermission(ctx, "object.upload", "你没有上传文件的权限");
  if (key) await assertFolderUnlockedForPath(req, ctx, bucketId, key);
  return await resolveBucketCredentials(ctx, bucketId);
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = body.action as Action | undefined;
    if (!action) return NextResponse.json({ error: "缺少操作类型" }, { status: 400 });

    const bucketId = body.bucket as string | undefined;
    const key = body.key as string | undefined;

    if (!bucketId || !key) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });

    const { creds } = await resolveBucket(req, bucketId, key);
    const bucket = createR2Bucket(creds);

    if (action === "create") {
      const contentType = body.contentType as string | undefined;
      if (!bucket.createMultipartUpload) return NextResponse.json({ error: "当前环境不支持分片上传" }, { status: 400 });
      const upload = await bucket.createMultipartUpload(key, {
        httpMetadata: contentType ? { contentType } : undefined,
      });
      return NextResponse.json({ uploadId: upload.uploadId });
    }

    if (action === "signPart") {
      const uploadId = body.uploadId as string | undefined;
      const partNumber = body.partNumber as number | undefined;
      if (!uploadId || !partNumber) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });

      const token = await issueRouteToken(
        {
          op: "mp",
          creds,
          key,
          uploadId,
          partNumber,
        },
        15 * 60,
      );

      const proxyUrl = `/api/multipart?token=${encodeURIComponent(token)}`;
      let directUrl = "";
      try {
        directUrl = await getPresignedObjectUrl({
          creds,
          key,
          method: "PUT",
          query: { partNumber, uploadId },
          expiresInSeconds: 15 * 60,
        });
      } catch {
        // Keep proxy fallback.
      }
      return NextResponse.json({ url: directUrl || proxyUrl, proxyUrl, isDirect: Boolean(directUrl) });
    }

    if (action === "complete") {
      const uploadId = body.uploadId as string | undefined;
      const parts = body.parts as Array<{ etag: string; partNumber: number }> | undefined;
      if (!uploadId || !parts?.length) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });

      if (!bucket.resumeMultipartUpload) return NextResponse.json({ error: "当前环境不支持分片上传" }, { status: 400 });
      const upload = bucket.resumeMultipartUpload(key, uploadId);
      await upload.complete(parts);
      return NextResponse.json({ ok: true });
    }

    if (action === "abort") {
      const uploadId = body.uploadId as string | undefined;
      if (!uploadId) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });

      if (!bucket.resumeMultipartUpload) return NextResponse.json({ error: "当前环境不支持分片上传" }, { status: 400 });
      const upload = bucket.resumeMultipartUpload(key, uploadId);
      await upload.abort();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "无效的操作类型" }, { status: 400 });
  } catch (error: unknown) {
    const lock = (error as { folderLock?: unknown })?.folderLock;
    return NextResponse.json({ error: toMessage(error), ...(lock && typeof lock === "object" ? { lock } : {}) }, { status: toStatus(error) });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    let payload: MultipartRouteToken;
    if (token) {
      payload = await readRouteToken<MultipartRouteToken>(token, "mp");
    } else {
      const bucketId = searchParams.get("bucket");
      const key = searchParams.get("key");
      const uploadId = searchParams.get("uploadId");
      const partNumberStr = searchParams.get("partNumber");
      const partNumber = partNumberStr ? Number.parseInt(partNumberStr, 10) : NaN;
      if (!bucketId || !key || !uploadId || !Number.isFinite(partNumber) || partNumber <= 0) {
        return new Response(JSON.stringify({ error: "请求参数不完整" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const resolved = await resolveBucket(req, bucketId, key);
      payload = {
        op: "mp",
        creds: resolved.creds,
        key,
        uploadId,
        partNumber,
      };
    }

    const bucket = createR2Bucket(payload.creds);
    if (!bucket.resumeMultipartUpload) {
      return new Response(JSON.stringify({ error: "当前环境不支持分片上传" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const upload = bucket.resumeMultipartUpload(payload.key, payload.uploadId);
    const bodyBytes = req.body ? new Uint8Array(await new Response(req.body).arrayBuffer()) : new Uint8Array();
    const res = await upload.uploadPart(payload.partNumber, bodyBytes);

    const headers = new Headers();
    if (res?.etag) headers.set("ETag", res.etag);
    return new Response(null, { status: 200, headers });
  } catch (error: unknown) {
    const lock = (error as { folderLock?: unknown })?.folderLock;
    return new Response(JSON.stringify({ error: toMessage(error), ...(lock && typeof lock === "object" ? { lock } : {}) }), {
      status: toStatus(error),
      headers: { "Content-Type": "application/json" },
    });
  }
}
