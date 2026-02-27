import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, requirePermission } from "@/lib/access-control";
import { getPresignedObjectUrl } from "@/lib/r2-s3";
import { issueRouteToken } from "@/lib/route-token";
import { resolveBucketCredentials } from "@/lib/user-buckets";
import { toChineseErrorMessage } from "@/lib/error-zh";
import { assertFolderUnlockedForPath } from "@/lib/folder-locks";

export const runtime = "edge";

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => toChineseErrorMessage(error, "下载链接生成失败，请稍后重试。");
const createHttpError = (status: number, message: string) => {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
};

const encodeRFC5987ValueChars = (value: string) =>
  encodeURIComponent(value)
    .replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, "%2A");

const buildContentDisposition = (filename: string, kind: "attachment" | "inline") => {
  const safeFallback = filename.replace(/[\/\\"]/g, "_");
  const encoded = encodeRFC5987ValueChars(filename);
  return `${kind}; filename="${safeFallback}"; filename*=UTF-8''${encoded}`;
};

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "object.read", "你没有下载文件的权限");

    const { searchParams } = new URL(req.url);
    const bucketId = searchParams.get("bucket");
    const key = searchParams.get("key");
    const download = searchParams.get("download") === "1";
    const forceProxy = searchParams.get("forceProxy") === "1";
    const forcePresigned = searchParams.get("forcePresigned") === "1";
    const filename = searchParams.get("filename") ?? "";

    if (!bucketId || !key) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });
    if (forceProxy && forcePresigned) {
      return NextResponse.json({ error: "请求参数冲突：不能同时指定 forceProxy 和 forcePresigned" }, { status: 400 });
    }
    const lock = await assertFolderUnlockedForPath(req, ctx, bucketId, key);
    const urlExpiresInSeconds = lock ? 30 * 60 : 24 * 3600;

    const { creds } = await resolveBucketCredentials(ctx, bucketId);

    if (!forceProxy) {
      try {
        const resolvedName = filename || key.split("/").pop() || "download";
        const contentDisposition = buildContentDisposition(resolvedName, download ? "attachment" : "inline");
        const url = await getPresignedObjectUrl({
          creds,
          key,
          method: "GET",
          expiresInSeconds: urlExpiresInSeconds,
          responseContentDisposition: contentDisposition,
        });
        return NextResponse.json({ url });
      } catch (error: unknown) {
        if (forcePresigned) {
          throw createHttpError(502, toChineseErrorMessage(error, "R2 直连模式失败，请检查桶名、AK/SK 或 CORS 设置。"));
        }
        // Fall back to proxy mode.
      }
    }

    const origin = new URL(req.url).origin;
    const token = await issueRouteToken(
      {
        op: "object",
        creds,
        key,
        download,
      },
      urlExpiresInSeconds,
    );

    const url = `${origin}/api/object?token=${encodeURIComponent(token)}${
      filename ? `&filename=${encodeURIComponent(filename)}` : ""
    }`;

    return NextResponse.json({ url });
  } catch (error: unknown) {
    const lock = (error as { folderLock?: unknown })?.folderLock;
    return NextResponse.json({ error: toMessage(error), ...(lock && typeof lock === "object" ? { lock } : {}) }, { status: toStatus(error) });
  }
}
