import { NextRequest } from "next/server";
import { getAppAccessContextFromRequest, requirePermission } from "@/lib/access-control";
import { createR2Bucket, type R2BucketLike } from "@/lib/r2-s3";
import { readRouteToken, type ObjectRouteToken } from "@/lib/route-token";
import { resolveBucketCredentials } from "@/lib/user-buckets";
import { toChineseErrorMessage } from "@/lib/error-zh";
import { assertFolderUnlockedForPath } from "@/lib/folder-locks";

export const runtime = "edge";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Range,Content-Type,Authorization",
  "Access-Control-Expose-Headers": "Accept-Ranges,Content-Length,Content-Range,Content-Type,Content-Disposition,ETag",
} as const;

const safeFilename = (name: string) => {
  const cleaned = name.replaceAll("\n", " ").replaceAll("\r", " ").replaceAll('"', "'");
  return cleaned.slice(0, 180) || "download";
};

const toAsciiFilename = (name: string) => {
  const ascii = name
    .replaceAll("\\", "_")
    .replaceAll('"', "'")
    .replace(/[^\x20-\x7E]/g, "_")
    .trim();
  return ascii || "download";
};

const encodeRFC5987ValueChars = (input: string) =>
  encodeURIComponent(input).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);

const buildContentDisposition = (mode: "attachment" | "inline", filename: string) => {
  const ascii = toAsciiFilename(filename);
  const utf8 = encodeRFC5987ValueChars(filename);
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
};

const json = (status: number, obj: unknown) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

const inferBodyLength = (body: BodyInit | null | undefined): number | undefined => {
  if (body == null) return undefined;
  if (typeof body === "string") return new TextEncoder().encode(body).byteLength;
  if (body instanceof Blob) return body.size;
  if (body instanceof Uint8Array) return body.byteLength;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  return undefined;
};

const resolveObjectSize = async (
  bucket: R2BucketLike,
  key: string,
  primary?: number | null,
  secondary?: number | null,
): Promise<number | undefined> => {
  if (typeof primary === "number" && Number.isFinite(primary) && primary >= 0) return primary;
  if (typeof secondary === "number" && Number.isFinite(secondary) && secondary >= 0) return secondary;
  try {
    const listed = await bucket.list({ prefix: key, limit: 10 });
    const exact = (listed.objects ?? []).find((item) => item.key === key);
    if (typeof exact?.size === "number" && Number.isFinite(exact.size) && exact.size >= 0) {
      return exact.size;
    }
  } catch {
    // best effort fallback
  }
  return undefined;
};

const parseRange = (rangeHeader: string | null, totalSize: number | null) => {
  if (!rangeHeader) return null;
  const m = rangeHeader.match(/^bytes=(\d*)-(\d*)$/i);
  if (!m) return null;
  const a = m[1];
  const b = m[2];

  if (!a && b) {
    if (totalSize == null) return null;
    const n = Number.parseInt(b, 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    const end = totalSize - 1;
    const start = Math.max(0, totalSize - n);
    return { start, end };
  }

  const start = a ? Number.parseInt(a, 10) : NaN;
  if (!Number.isFinite(start) || start < 0) return null;

  if (!b) {
    if (totalSize == null) return null;
    return { start, end: totalSize - 1 };
  }

  const end = Number.parseInt(b, 10);
  if (!Number.isFinite(end) || end < start) return null;
  return { start, end };
};

const resolveFromAuth = async (req: NextRequest, bucketId: string) => {
  const ctx = await getAppAccessContextFromRequest(req);
  requirePermission(ctx, "object.read", "你没有读取对象的权限");
  const resolved = await resolveBucketCredentials(ctx, bucketId);
  return { ctx, resolved };
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token") ?? "";
    const filename = searchParams.get("filename");

    let creds: ObjectRouteToken["creds"];
    let key: string;
    let download: boolean;

    if (token) {
      const payload = await readRouteToken<ObjectRouteToken>(token, "object");
      creds = payload.creds;
      key = payload.key;
      download = Boolean(payload.download);
    } else {
      const bucketId = searchParams.get("bucket");
      const keyFromQuery = searchParams.get("key");
      download = searchParams.get("download") === "1";
      if (!bucketId || !keyFromQuery) return json(400, { error: "请求参数不完整" });
      const { ctx, resolved } = await resolveFromAuth(req, bucketId);
      await assertFolderUnlockedForPath(req, ctx, bucketId, keyFromQuery);
      creds = resolved.creds;
      key = keyFromQuery;
    }

    const suggestedName = safeFilename(filename || key.split("/").pop() || "download");
    const bucket = createR2Bucket(creds);

    let head: Awaited<ReturnType<typeof bucket.head>> = null;
    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      head = await bucket.head(key);
    } else if (download) {
      try {
        head = await bucket.head(key);
      } catch {
        head = null;
      }
    }

    const totalSizeResolved = await resolveObjectSize(bucket, key, head?.size);
    const totalSize: number | null = typeof totalSizeResolved === "number" ? totalSizeResolved : null;
    const range = parseRange(rangeHeader, totalSize);

    const headers = new Headers();
    Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
    headers.set("Cache-Control", "no-store");
    headers.set("Accept-Ranges", "bytes");

    if (download) {
      headers.set("Content-Disposition", buildContentDisposition("attachment", suggestedName));
    }

    if (range) {
      const length = range.end - range.start + 1;
      const obj = await bucket.get(key, { range: { offset: range.start, length } });
      if (!obj) return new Response("Not found", { status: 404, headers });

      const contentType = obj.httpMetadata?.contentType;
      if (contentType) headers.set("Content-Type", contentType);

      if (!download && (filename || contentType === "application/pdf")) {
        headers.set("Content-Disposition", buildContentDisposition("inline", suggestedName));
      }

      if (totalSize != null) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${totalSize}`);
      headers.set("Content-Length", String(length));

      const etag = obj.httpEtag ?? obj.etag;
      if (etag) headers.set("ETag", etag);

      return new Response(obj.body, { status: 206, headers });
    }

    const obj = await bucket.get(key);
    if (!obj) return new Response("Not found", { status: 404, headers });

    const contentType = obj.httpMetadata?.contentType;
    if (contentType) headers.set("Content-Type", contentType);

    if (!download && (filename || contentType === "application/pdf")) {
      headers.set("Content-Disposition", buildContentDisposition("inline", suggestedName));
    }

    const resolvedSize = await resolveObjectSize(bucket, key, obj.size, head?.size);
    const size = resolvedSize ?? inferBodyLength(obj.body);
    if (typeof size === "number") headers.set("Content-Length", String(size));

    const etag = obj.httpEtag ?? obj.etag ?? head?.etag;
    if (etag) headers.set("ETag", etag);

    return new Response(obj.body, { status: 200, headers });
  } catch (error: unknown) {
    const status = Number((error as { status?: unknown })?.status ?? NaN);
    const code = Number.isFinite(status) && status >= 100 ? status : 500;
    const message = toChineseErrorMessage(error, "读取对象失败，请稍后重试。");
    const lock = (error as { folderLock?: unknown })?.folderLock;
    return json(code, { error: message, ...(lock && typeof lock === "object" ? { lock } : {}) });
  }
}
