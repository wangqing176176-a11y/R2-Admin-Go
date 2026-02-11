import { NextRequest } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase";
import { createR2Bucket } from "@/lib/r2-s3";
import { readRouteToken, type ObjectRouteToken } from "@/lib/route-token";
import { resolveBucketCredentials } from "@/lib/user-buckets";

export const runtime = "edge";

const safeFilename = (name: string) => {
  const cleaned = name.replaceAll("\n", " ").replaceAll("\r", " ").replaceAll('"', "'");
  return cleaned.slice(0, 180) || "download";
};

const json = (status: number, obj: unknown) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

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
  const auth = await requireSupabaseUser(req);
  return await resolveBucketCredentials(auth.token, bucketId);
};

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
      if (!bucketId || !keyFromQuery) return json(400, { error: "Missing params" });
      const resolved = await resolveFromAuth(req, bucketId);
      creds = resolved.creds;
      key = keyFromQuery;
    }

    const suggestedName = safeFilename(filename || key.split("/").pop() || "download");
    const bucket = createR2Bucket(creds);

    let head: Awaited<ReturnType<typeof bucket.head>> = null;
    const rangeHeader = req.headers.get("range");
    if (rangeHeader || download) head = await bucket.head(key);

    const totalSize: number | null = head?.size ?? null;
    const range = parseRange(rangeHeader, totalSize);

    const headers = new Headers();
    headers.set("Cache-Control", "no-store");
    headers.set("Accept-Ranges", "bytes");

    if (download) {
      headers.set("Content-Disposition", `attachment; filename="${suggestedName}"`);
    }

    if (range) {
      const length = range.end - range.start + 1;
      const obj = await bucket.get(key, { range: { offset: range.start, length } });
      if (!obj) return new Response("Not found", { status: 404 });

      const contentType = obj.httpMetadata?.contentType;
      if (contentType) headers.set("Content-Type", contentType);

      if (!download && (filename || contentType === "application/pdf")) {
        headers.set("Content-Disposition", `inline; filename="${suggestedName}"`);
      }

      if (totalSize != null) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${totalSize}`);
      headers.set("Content-Length", String(length));

      const etag = obj.httpEtag ?? obj.etag;
      if (etag) headers.set("ETag", etag);

      return new Response(obj.body, { status: 206, headers });
    }

    const obj = await bucket.get(key);
    if (!obj) return new Response("Not found", { status: 404 });

    const contentType = obj.httpMetadata?.contentType;
    if (contentType) headers.set("Content-Type", contentType);

    if (!download && (filename || contentType === "application/pdf")) {
      headers.set("Content-Disposition", `inline; filename="${suggestedName}"`);
    }

    const size = obj.size ?? head?.size;
    if (typeof size === "number") headers.set("Content-Length", String(size));

    const etag = obj.httpEtag ?? obj.etag ?? head?.etag;
    if (etag) headers.set("ETag", etag);

    return new Response(obj.body, { status: 200, headers });
  } catch (error: unknown) {
    const status = Number((error as { status?: unknown })?.status ?? NaN);
    const code = Number.isFinite(status) && status >= 100 ? status : 500;
    const message = error instanceof Error ? error.message : String(error);
    return json(code, { error: message });
  }
}
