import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase";
import { copyObjectInBucket, createR2Bucket, type R2BucketLike, type R2ClientCredentials } from "@/lib/r2-s3";
import { resolveBucketCredentials } from "@/lib/user-buckets";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

type Operation = "move" | "copy" | "delete" | "mkdir" | "moveMany" | "copyMany" | "deleteMany";

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => toChineseErrorMessage(error, "文件操作失败，请稍后重试。");

const listAllKeysWithPrefix = async (bucket: R2BucketLike, prefix: string) => {
  const keys: string[] = [];
  let cursor: string | undefined = undefined;

  for (;;) {
    const res = await bucket.list({ prefix, cursor });
    for (const o of res.objects ?? []) keys.push(o.key);
    if (!res.truncated) break;
    cursor = res.cursor;
    if (!cursor) break;
  }

  return keys;
};

const deleteKeys = async (bucket: R2BucketLike, keys: string[]) => {
  const chunkSize = 1000;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    await bucket.delete(chunk);
  }
};

const copyObject = async (bucket: R2BucketLike, creds: R2ClientCredentials, fromKey: string, toKey: string) => {
  if (fromKey === toKey) return;

  // Prefer provider-side copy to avoid streaming file data through runtime.
  try {
    await copyObjectInBucket(creds, fromKey, toKey);
    return;
  } catch {
    // Fallback to get+put for environments where CopyObject may be restricted.
  }

  const obj = await bucket.get(fromKey);
  if (!obj) throw new Error("源文件不存在或已被删除");
  await bucket.put(toKey, obj.body, { httpMetadata: obj.httpMetadata, customMetadata: obj.customMetadata });
};

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSupabaseUser(req);

    const { bucket: bucketId, sourceKey, sourceKeys, targetKey, targetPrefix, operation } = (await req.json()) as {
      bucket?: string;
      sourceKey?: string;
      sourceKeys?: string[];
      targetKey?: string;
      targetPrefix?: string;
      operation?: Operation;
    };

    if (!bucketId) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });

    const op: Operation = operation ?? "move";
    if (
      op !== "move" &&
      op !== "copy" &&
      op !== "delete" &&
      op !== "mkdir" &&
      op !== "moveMany" &&
      op !== "copyMany" &&
      op !== "deleteMany"
    ) {
      return NextResponse.json({ error: "无效的操作类型" }, { status: 400 });
    }

    const { creds } = await resolveBucketCredentials(auth.token, bucketId);
    const bucket = createR2Bucket(creds);

    if (op === "mkdir") {
      if (!targetKey) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });
      const key = targetKey.endsWith("/") ? targetKey : `${targetKey}/`;
      await bucket.put(key, new Uint8Array(0), { httpMetadata: { contentType: "application/x-directory" } });
      return NextResponse.json({ success: true });
    }

    if (op === "moveMany" || op === "copyMany") {
      const keys = (sourceKeys ?? []).filter((k) => typeof k === "string" && k.length > 0);
      if (!keys.length) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });
      if (!targetPrefix) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });

      let destPrefix = String(targetPrefix).trim();
      if (destPrefix.startsWith("/")) destPrefix = destPrefix.slice(1);
      if (destPrefix && !destPrefix.endsWith("/")) destPrefix += "/";

      let moved = 0;
      for (const k of keys) {
        const isPrefix = k.endsWith("/");
        if (!isPrefix) {
          const base = k.split("/").pop() || k;
          const dest = `${destPrefix}${base}`;
          await copyObject(bucket, creds, k, dest);
          if (op === "moveMany") await bucket.delete(k);
          moved += 1;
          continue;
        }

        const folderName = k.split("/").filter(Boolean).pop() || "folder";
        const destRoot = `${destPrefix}${folderName}/`;
        const all = await listAllKeysWithPrefix(bucket, k);
        for (const src of all) {
          const dest = destRoot + src.slice(k.length);
          await copyObject(bucket, creds, src, dest);
        }
        if (op === "moveMany") await deleteKeys(bucket, all);
        moved += all.length;
      }

      return NextResponse.json({ success: true, count: moved });
    }

    if (op === "deleteMany") {
      const keys = (sourceKeys ?? []).filter((k) => typeof k === "string" && k.length > 0);
      if (!keys.length) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });

      const toDelete: string[] = [];
      for (const k of keys) {
        const isPrefix = k.endsWith("/");
        if (!isPrefix) {
          toDelete.push(k);
          continue;
        }
        const all = await listAllKeysWithPrefix(bucket, k);
        for (const src of all) toDelete.push(src);
      }

      const uniq = Array.from(new Set(toDelete));
      await deleteKeys(bucket, uniq);
      return NextResponse.json({ success: true, count: uniq.length });
    }

    if (!sourceKey) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });

    const isPrefix = sourceKey.endsWith("/");

    if (op === "delete") {
      if (!isPrefix) {
        await bucket.delete(sourceKey);
        return NextResponse.json({ success: true, count: 1 });
      }
      const keys = await listAllKeysWithPrefix(bucket, sourceKey);
      await deleteKeys(bucket, keys);
      return NextResponse.json({ success: true, count: keys.length });
    }

    if (!targetKey) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });

    if (!isPrefix) {
      await copyObject(bucket, creds, sourceKey, targetKey);
      if (op === "move") await bucket.delete(sourceKey);
      return NextResponse.json({ success: true, count: 1 });
    }

    const keys = await listAllKeysWithPrefix(bucket, sourceKey);
    const toCopy = keys.filter((k) => k.startsWith(sourceKey));

    for (const k of toCopy) {
      const newKey = targetKey + k.slice(sourceKey.length);
      await copyObject(bucket, creds, k, newKey);
    }

    if (op === "move") await deleteKeys(bucket, toCopy);

    return NextResponse.json({ success: true, count: toCopy.length });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}
