import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, requirePermission } from "@/lib/access-control";
import { copyObjectInBucket, createR2Bucket, getPresignedObjectUrl } from "@/lib/r2-s3";
import { issueRouteToken, readRouteToken, type MultipartRouteToken } from "@/lib/route-token";
import { resolveBucketCredentials } from "@/lib/user-buckets";
import { toChineseErrorMessage } from "@/lib/error-zh";
import { assertFolderUnlockedForPath } from "@/lib/folder-locks";
import { writeAuditLog } from "@/lib/audit-logs";
import { INTERNAL_STORAGE_ROOT, moveItemsToRecycle } from "@/lib/file-marks";
import { assertFolderRouteAccess, folderRouteAccessFor, setFolderRouteSession } from "@/lib/folder-route-access";

export const runtime = "edge";

type Action = "create" | "signPart" | "complete" | "abort";

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => toChineseErrorMessage(error, "分片上传操作失败，请稍后重试。");

const conflictError = () => Object.assign(
  new Error("目标位置已存在同名文件，系统已阻止覆盖。请刷新列表后重新选择处理方式。"),
  { status: 409 },
);

const uploadStorageRoot = (teamId: string, userId: string) => `${INTERNAL_STORAGE_ROOT}uploads/${teamId}/${userId}/`;

const assertUploadKey = (value: unknown, teamId: string, userId: string) => {
  const key = typeof value === "string" ? value : "";
  if (!key.startsWith(uploadStorageRoot(teamId, userId))) {
    throw Object.assign(new Error("分片上传临时路径无效，请重新开始上传。"), { status: 400 });
  }
  return key;
};

const resolveBucket = async (req: NextRequest, bucketId: string, key?: string) => {
  const ctx = await getAppAccessContextFromRequest(req);
  requirePermission(ctx, "object.upload", "你没有上传文件的权限");
  const lock = key ? await assertFolderUnlockedForPath(req, ctx, bucketId, key) : null;
  return { ...(await resolveBucketCredentials(ctx, bucketId)), ctx, lock };
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = body.action as Action | undefined;
    if (!action) return NextResponse.json({ error: "缺少操作类型" }, { status: 400 });

    const bucketId = body.bucket as string | undefined;
    const key = body.key as string | undefined;

    if (!bucketId || !key) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });

    const { creds, ctx, lock } = await resolveBucket(req, bucketId, key);
    const bucket = createR2Bucket(creds);

    if (action === "create") {
      const contentType = body.contentType as string | undefined;
      const conflictPolicy = body.conflictPolicy === "replace" ? "replace" : "reject";
      const existing = await bucket.head(key);
      if (existing) {
        if (conflictPolicy !== "replace") throw conflictError();
        requirePermission(ctx, "object.delete", "替换同名文件需要删除文件权限");
      }
      if (!bucket.createMultipartUpload) return NextResponse.json({ error: "当前环境不支持分片上传" }, { status: 400 });
      const uploadKey = `${uploadStorageRoot(ctx.team.id, ctx.user.id)}${crypto.randomUUID()}`;
      const upload = await bucket.createMultipartUpload(uploadKey, {
        httpMetadata: contentType ? { contentType } : undefined,
      });
      return NextResponse.json({ uploadId: upload.uploadId, uploadKey });
    }

    if (action === "signPart") {
      const uploadId = body.uploadId as string | undefined;
      const uploadKey = assertUploadKey(body.uploadKey, ctx.team.id, ctx.user.id);
      const partNumber = body.partNumber as number | undefined;
      if (!uploadId || !partNumber) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });

      const token = await issueRouteToken(
        {
          op: "mp",
          creds,
          key: uploadKey,
          targetKey: key,
          uploadId,
          partNumber,
          ...(lock ? { folderAccess: folderRouteAccessFor(ctx, bucketId) } : {}),
        },
        15 * 60,
      );

      const proxyUrl = `/api/multipart?token=${encodeURIComponent(token)}`;
      let directUrl = "";
      try {
        if (lock) throw new Error("Protected uploads use the authenticated proxy");
        directUrl = await getPresignedObjectUrl({
          creds,
          key: uploadKey,
          method: "PUT",
          query: { partNumber, uploadId },
          expiresInSeconds: 15 * 60,
        });
      } catch {
        // Keep proxy fallback.
      }
      const res = NextResponse.json({ url: directUrl || proxyUrl, proxyUrl, isDirect: Boolean(directUrl) });
      if (lock) await setFolderRouteSession(res, ctx);
      return res;
    }

    if (action === "complete") {
      const uploadId = body.uploadId as string | undefined;
      const uploadKey = assertUploadKey(body.uploadKey, ctx.team.id, ctx.user.id);
      const conflictPolicy = body.conflictPolicy === "replace" ? "replace" : "reject";
      const parts = body.parts as Array<{ etag: string; partNumber: number }> | undefined;
      if (!uploadId || !parts?.length) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });

      if (!bucket.resumeMultipartUpload) return NextResponse.json({ error: "当前环境不支持分片上传" }, { status: 400 });
      const upload = bucket.resumeMultipartUpload(uploadKey, uploadId);
      await upload.complete(parts);

      try {
        const existing = await bucket.head(key);
        if (existing) {
          if (conflictPolicy !== "replace") throw conflictError();
          requirePermission(ctx, "object.delete", "替换同名文件需要删除文件权限");
          const moved = await moveItemsToRecycle(ctx, bucketId, [{ key, type: "file", size: existing.size }]);
          for (const item of moved) {
            await writeAuditLog(ctx, {
              bucketId,
              action: "move_to_recycle",
              itemType: "file",
              itemKey: item.key,
              itemName: item.name,
              summary: `${ctx.displayName} 替换同名文件前将旧版「${item.name}」移入回收站`,
            });
          }
        }
        await copyObjectInBucket(creds, uploadKey, key, { destinationIfNoneMatch: "*" });
      } catch (error) {
        await bucket.delete(uploadKey).catch(() => undefined);
        if (toStatus(error) === 412) throw conflictError();
        throw error;
      }
      await bucket.delete(uploadKey).catch((error) => console.error("清理分片上传临时文件失败", error));
      await writeAuditLog(ctx, {
        bucketId,
        action: "upload",
        itemType: "file",
        itemKey: key,
        itemName: key.split("/").pop() || key,
        summary: `${ctx.displayName} 上传「${key}」`,
        metadata: { parts: parts.length },
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "abort") {
      const uploadId = body.uploadId as string | undefined;
      const uploadKey = assertUploadKey(body.uploadKey, ctx.team.id, ctx.user.id);
      if (!uploadId) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });

      if (!bucket.resumeMultipartUpload) return NextResponse.json({ error: "当前环境不支持分片上传" }, { status: 400 });
      const upload = bucket.resumeMultipartUpload(uploadKey, uploadId);
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
      if (payload.folderAccess) await assertFolderRouteAccess(req, payload.folderAccess, payload.targetKey ?? payload.key, "object.upload");
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
