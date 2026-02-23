import { NextRequest, NextResponse } from "next/server";
import {
  getAppAccessContextFromRequest,
  requirePermission,
} from "@/lib/access-control";
import { createR2Bucket, getPresignedObjectUrl } from "@/lib/r2-s3";
import { issueRouteToken, readRouteToken, type PutRouteToken } from "@/lib/route-token";
import { resolveBucketCredentials } from "@/lib/user-buckets";
import { toChineseErrorMessage } from "@/lib/error-zh";
import {
  assertFolderUnlockedForPath,
  findEffectiveFolderLockFromRows,
  getDirectChildLockedPrefixSet,
  listFolderLocksByBucket,
} from "@/lib/folder-locks";
import { createFolderLockedError, readFolderUnlockGrants } from "@/lib/folder-lock-access";

export const runtime = "edge";
const FOLDER_STATS_SCAN_OBJECT_LIMIT = 100_000;
const FOLDER_STATS_SCAN_PAGE_LIMIT = 120;

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => toChineseErrorMessage(error, "请求失败，请稍后重试。");

const json = (status: number, obj: unknown) => NextResponse.json(obj, { status });

const resolveBucket = async (req: NextRequest, bucketId: string) => {
  const ctx = await getAppAccessContextFromRequest(req);
  return {
    ctx,
    resolved: await resolveBucketCredentials(ctx, bucketId),
  };
};

const normalizeIsoTime = (value: unknown) => {
  if (typeof value !== "string" || !value) return undefined;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return undefined;
  return new Date(t).toISOString();
};

const readObjectSize = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
};

const collectFolderStatsForLevel = async (
  bucket: ReturnType<typeof createR2Bucket>,
  prefix: string,
) => {
  const stats = new Map<string, { size: number; lastModified?: string }>();
  let cursor: string | undefined;
  let scanned = 0;

  for (let page = 0; page < FOLDER_STATS_SCAN_PAGE_LIMIT; page += 1) {
    const pageRes = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const obj of pageRes.objects ?? []) {
      const key = typeof obj?.key === "string" ? obj.key : "";
      if (!key || !key.startsWith(prefix)) continue;

      const rest = key.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (!rest || slash <= 0) continue;

      const topFolderName = rest.slice(0, slash);
      const folderKey = `${prefix}${topFolderName}/`;
      const size = readObjectSize(obj?.size);
      const uploaded = normalizeIsoTime(obj?.uploaded);
      const prev = stats.get(folderKey) ?? { size: 0 };
      prev.size += size;
      if (uploaded && (!prev.lastModified || uploaded > prev.lastModified)) {
        prev.lastModified = uploaded;
      }
      stats.set(folderKey, prev);

      scanned += 1;
      if (scanned >= FOLDER_STATS_SCAN_OBJECT_LIMIT) break;
    }
    if (scanned >= FOLDER_STATS_SCAN_OBJECT_LIMIT) break;
    if (!pageRes.truncated || !pageRes.cursor) break;
    cursor = pageRes.cursor;
  }

  return stats;
};

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "object.list", "你没有浏览文件的权限");

    const { searchParams } = new URL(req.url);
    const bucketId = searchParams.get("bucket");
    const prefix = searchParams.get("prefix") || "";
    const includeFolderStats =
      searchParams.get("folderStats") === "1" || searchParams.get("includeFolderStats") === "1";

    if (!bucketId) return json(400, { error: "缺少存储桶参数" });

    const [{ creds }, lockRows, unlockGrants] = await Promise.all([
      resolveBucketCredentials(ctx, bucketId),
      listFolderLocksByBucket(ctx, bucketId),
      readFolderUnlockGrants(req),
    ]);
    const isUnlockedPath = (targetPrefix: string) =>
      unlockGrants.some((g) => g.bucketId === bucketId && targetPrefix.startsWith(g.prefix));
    const currentLock = prefix ? findEffectiveFolderLockFromRows(lockRows, prefix) : null;

    if (prefix && currentLock && !isUnlockedPath(prefix)) {
      throw createFolderLockedError(
        {
          bucketId,
          prefix: currentLock.prefix,
          hint: currentLock.hint ?? undefined,
        },
        "该文件夹已加密，请先输入密码解锁后再操作",
      );
    }

    const bucket = createR2Bucket(creds);
    const directLockedPrefixes = getDirectChildLockedPrefixSet(lockRows, prefix);
    const listed = await bucket.list({ prefix, delimiter: "/" });
    // Recursive folder stats are expensive on large prefixes. Keep list loading fast by default
    // and only enable deep scanning when explicitly requested.
    const folderStats = includeFolderStats ? await collectFolderStatsForLevel(bucket, prefix) : new Map<string, { size: number; lastModified?: string }>();
    const folderPlaceholderMeta = new Map<string, { size?: number; lastModified?: string }>();
    for (const o of listed.objects ?? []) {
      const k = typeof o?.key === "string" ? (o.key as string) : "";
      if (!k || !k.endsWith("/")) continue;
      folderPlaceholderMeta.set(k, {
        size: Number.isFinite(Number(o.size)) ? Number(o.size) : undefined,
        lastModified: normalizeIsoTime(o.uploaded),
      });
    }

    const folders = (listed.delimitedPrefixes ?? []).map((p: string) => {
      const stats = folderStats.get(p);
      const placeholder = folderPlaceholderMeta.get(p);
      const isLocked = directLockedPrefixes.has(p);
      return {
        name: p.replace(prefix, "").replace(/\/$/, ""),
        key: p,
        type: "folder" as const,
        locked: isLocked,
        unlocked: isLocked ? isUnlockedPath(p) : undefined,
        size: stats?.size ?? placeholder?.size,
        lastModified: stats?.lastModified ?? placeholder?.lastModified,
      };
    });

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
        const stats = folderStats.get(k);
        const uploaded = normalizeIsoTime(o.uploaded);
        const isLocked = directLockedPrefixes.has(k);
        folders.push({
          name: inner,
          key: k,
          type: "folder" as const,
          locked: isLocked,
          unlocked: isLocked ? isUnlockedPath(k) : undefined,
          size: stats?.size ?? (Number.isFinite(size) ? size : undefined),
          lastModified: stats?.lastModified ?? uploaded,
        });
      }
    }

    return NextResponse.json({
      items: [...folders, ...files],
      lockContext: currentLock
        ? {
            currentPrefixLocked: true,
            prefix: currentLock.prefix,
            hint: currentLock.hint ?? null,
          }
        : {
            currentPrefixLocked: false,
          },
    });
  } catch (error: unknown) {
    const lock = (error as { folderLock?: unknown })?.folderLock;
    return json(toStatus(error), {
      error: toMessage(error),
      ...(lock && typeof lock === "object" ? { lock } : {}),
    });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "object.delete", "你没有删除文件的权限");

    const { searchParams } = new URL(req.url);
    const bucketId = searchParams.get("bucket");
    const key = searchParams.get("key");

    if (!bucketId || !key) return json(400, { error: "请求参数不完整" });
    await assertFolderUnlockedForPath(req, ctx, bucketId, key);

    const { creds } = await resolveBucketCredentials(ctx, bucketId);
    const bucket = createR2Bucket(creds);
    await bucket.delete(key);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const lock = (error as { folderLock?: unknown })?.folderLock;
    return json(toStatus(error), { error: toMessage(error), ...(lock && typeof lock === "object" ? { lock } : {}) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "object.upload", "你没有上传文件的权限");

    const { bucket, key } = (await req.json()) as { bucket?: string; key?: string };
    if (!bucket || !key) return json(400, { error: "请求参数不完整" });
    await assertFolderUnlockedForPath(req, ctx, bucket, key);

    const { creds } = await resolveBucketCredentials(ctx, bucket);
    let directUrl = "";
    try {
      directUrl = await getPresignedObjectUrl({
        creds,
        key,
        method: "PUT",
        expiresInSeconds: 15 * 60,
      });
    } catch {
      // Keep proxy fallback URL below.
    }

    const token = await issueRouteToken(
      {
        op: "put",
        creds,
        key,
      },
      15 * 60,
    );

    const proxyUrl = `/api/files?token=${encodeURIComponent(token)}`;
    return NextResponse.json({ url: directUrl || proxyUrl, proxyUrl, isDirect: Boolean(directUrl) });
  } catch (error: unknown) {
    const lock = (error as { folderLock?: unknown })?.folderLock;
    return json(toStatus(error), { error: toMessage(error), ...(lock && typeof lock === "object" ? { lock } : {}) });
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

      const { ctx, resolved } = await resolveBucket(req, bucketId);
      requirePermission(ctx, "object.upload", "你没有上传文件的权限");
      await assertFolderUnlockedForPath(req, ctx, bucketId, keyFromQuery);
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
    const lock = (error as { folderLock?: unknown })?.folderLock;
    return new Response(JSON.stringify({ error: toMessage(error), ...(lock && typeof lock === "object" ? { lock } : {}) }), {
      status: toStatus(error),
      headers: { "Content-Type": "application/json" },
    });
  }
}
