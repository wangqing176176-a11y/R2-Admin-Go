import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase";
import { createR2Bucket } from "@/lib/r2-s3";
import { issueRouteToken, readRouteToken, type PutRouteToken } from "@/lib/route-token";
import { resolveBucketCredentials } from "@/lib/user-buckets";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => toChineseErrorMessage(error, "请求失败，请稍后重试。");

const json = (status: number, obj: unknown) => NextResponse.json(obj, { status });

const resolveBucket = async (req: NextRequest, bucketId: string) => {
  const auth = await requireSupabaseUser(req);
  return await resolveBucketCredentials(auth.token, bucketId);
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const bucketId = searchParams.get("bucket");
    const prefix = searchParams.get("prefix") || "";

    if (!bucketId) return json(400, { error: "缺少存储桶参数" });

    const { creds } = await resolveBucket(req, bucketId);
    const bucket = createR2Bucket(creds);
    const listed = await bucket.list({ prefix, delimiter: "/" });

    const folders = (listed.delimitedPrefixes ?? []).map((p: string) => ({
      name: p.replace(prefix, "").replace(/\/$/, ""),
      key: p,
      type: "folder" as const,
    }));

    const folderKeys = new Set<string>(listed.delimitedPrefixes ?? []);
    const files = (listed.objects ?? [])
      .filter((o) => !(typeof o.key === "string" && o.key.endsWith("/") && Number(o.size ?? 0) === 0))
      .map((o) => ({
        name: String(o.key).replace(prefix, ""),
        key: o.key,
        size: o.size,
        lastModified: o.uploaded,
        type: "file" as const,
      }));

    for (const o of listed.objects ?? []) {
      const k = typeof o?.key === "string" ? (o.key as string) : "";
      const size = Number(o?.size ?? 0);
      if (!k || !k.startsWith(prefix) || !k.endsWith("/") || size !== 0) continue;
      const rest = k.slice(prefix.length);
      if (!rest) continue;
      const inner = rest.endsWith("/") ? rest.slice(0, -1) : rest;
      if (!inner || inner.includes("/")) continue;
      if (!folderKeys.has(k)) {
        folderKeys.add(k);
        folders.push({ name: inner, key: k, type: "folder" as const });
      }
    }

    return NextResponse.json({ items: [...folders, ...files] });
  } catch (error: unknown) {
    return json(toStatus(error), { error: toMessage(error) });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const bucketId = searchParams.get("bucket");
    const key = searchParams.get("key");

    if (!bucketId || !key) return json(400, { error: "请求参数不完整" });

    const { creds } = await resolveBucket(req, bucketId);
    const bucket = createR2Bucket(creds);
    await bucket.delete(key);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return json(toStatus(error), { error: toMessage(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { bucket, key } = (await req.json()) as { bucket?: string; key?: string };
    if (!bucket || !key) return json(400, { error: "请求参数不完整" });

    const { creds } = await resolveBucket(req, bucket);
    const token = await issueRouteToken(
      {
        op: "put",
        creds,
        key,
      },
      15 * 60,
    );

    const url = `/api/files?token=${encodeURIComponent(token)}`;
    return NextResponse.json({ url });
  } catch (error: unknown) {
    return json(toStatus(error), { error: toMessage(error) });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    let creds: PutRouteToken["creds"];
    let key: string;

    if (token) {
      const payload = await readRouteToken<PutRouteToken>(token, "put");
      creds = payload.creds;
      key = payload.key;
    } else {
      const bucketId = searchParams.get("bucket");
      const keyFromQuery = searchParams.get("key");
      if (!bucketId || !keyFromQuery) return new Response(JSON.stringify({ error: "请求参数不完整" }), { status: 400 });
      const resolved = await resolveBucket(req, bucketId);
      creds = resolved.creds;
      key = keyFromQuery;
    }

    const bucket = createR2Bucket(creds);
    const contentType = req.headers.get("content-type") || undefined;
    const result = await bucket.put(key, req.body, {
      httpMetadata: contentType ? { contentType } : undefined,
    });

    const headers = new Headers();
    if (result?.etag) headers.set("ETag", result.etag);
    return new Response(null, { status: 200, headers });
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: toMessage(error) }), {
      status: toStatus(error),
      headers: { "Content-Type": "application/json" },
    });
  }
}
