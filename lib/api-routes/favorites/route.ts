import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, requirePermission } from "@/lib/access-control";
import { addFavorite, listFavorites, removeFavorite } from "@/lib/file-marks";
import { toChineseErrorMessage } from "@/lib/error-zh";
import { writeAuditLog } from "@/lib/audit-logs";
import { createFolderAccessReader, assertFolderUnlockedForPath } from "@/lib/folder-locks";

export const runtime = "edge";

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "object.list", "你没有浏览文件的权限");
    const { searchParams } = new URL(req.url);
    const bucketId = searchParams.get("bucket") ?? "";
    if (!bucketId) return NextResponse.json({ error: "缺少存储桶参数" }, { status: 400 });
    const [items, access] = await Promise.all([listFavorites(ctx, bucketId), createFolderAccessReader(req, ctx, bucketId)]);
    return NextResponse.json({ items: items.filter((item) => access.isVisible(item.key)).map((item) => ({
      ...item, ...access.describe(item.key),
      size: access.decision(item.key) === "allow" ? item.size : undefined,
      lastModified: access.decision(item.key) === "allow" ? item.lastModified : undefined,
    })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const lock = (error as { folderLock?: unknown })?.folderLock;
    return NextResponse.json({ ...(lock ? { lock } : {}), error: toChineseErrorMessage(error, "读取收藏夹失败") }, { status: toStatus(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "object.read", "你没有收藏文件的权限");
    const body = (await req.json().catch(() => ({}))) as {
      bucket?: string;
      item?: {
        key?: string;
        type?: "file" | "folder";
        name?: string;
        size?: number;
        lastModified?: string;
      };
    };
    const bucketId = String(body.bucket ?? "").trim();
    if (!bucketId || !body.item?.key) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });
    await assertFolderUnlockedForPath(req, ctx, bucketId, body.item.key);
    const item = await addFavorite(ctx, bucketId, {
      key: body.item.key,
      type: body.item.type,
      name: body.item.name,
      size: body.item.size,
      lastModified: body.item.lastModified,
    });
    await writeAuditLog(ctx, {
      bucketId,
      action: "favorite_add",
      itemType: body.item.type ?? (body.item.key.endsWith("/") ? "folder" : "file"),
      itemKey: body.item.key,
      itemName: body.item.name,
      summary: `${ctx.displayName} 添加收藏「${body.item.name || body.item.key}」`,
    });
    return NextResponse.json({ success: true, item });
  } catch (error) {
    const lock = (error as { folderLock?: unknown })?.folderLock;
    return NextResponse.json({ ...(lock ? { lock } : {}), error: toChineseErrorMessage(error, "添加收藏失败") }, { status: toStatus(error) });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "object.read", "你没有取消收藏的权限");
    const { searchParams } = new URL(req.url);
    const bucketId = searchParams.get("bucket") ?? "";
    const key = searchParams.get("key") ?? "";
    if (!bucketId || !key) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });
    const access = await createFolderAccessReader(req, ctx, bucketId);
    access.assert(key);
    await removeFavorite(ctx, bucketId, key);
    await writeAuditLog(ctx, {
      bucketId,
      action: "favorite_remove",
      itemType: key.endsWith("/") ? "folder" : "file",
      itemKey: key,
      itemName: key.split("/").filter(Boolean).pop() || key,
      summary: `${ctx.displayName} 取消收藏「${key}」`,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const lock = (error as { folderLock?: unknown })?.folderLock;
    return NextResponse.json({ ...(lock ? { lock } : {}), error: toChineseErrorMessage(error, "取消收藏失败") }, { status: toStatus(error) });
  }
}
