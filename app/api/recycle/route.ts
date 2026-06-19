import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, requirePermission } from "@/lib/access-control";
import {
  clearRecycleItems,
  listRecycleItems,
  moveItemsToRecycle,
  permanentlyDeleteRecycleItems,
  permanentlyDeleteRecycleItem,
  restoreRecycleItems,
  restoreRecycleItem,
} from "@/lib/file-marks";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "object.list", "你没有浏览回收站的权限");
    const { searchParams } = new URL(req.url);
    const bucketId = searchParams.get("bucket") ?? "";
    if (!bucketId) return NextResponse.json({ error: "缺少存储桶参数" }, { status: 400 });
    const items = await listRecycleItems(ctx, bucketId);
    return NextResponse.json({
      items,
      canPermanentDelete: ctx.role === "admin" || ctx.role === "super_admin" || ctx.isSuperAdmin,
    });
  } catch (error) {
    return NextResponse.json({ error: toChineseErrorMessage(error, "读取回收站失败") }, { status: toStatus(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "object.delete", "你没有删除文件的权限");
    const body = (await req.json().catch(() => ({}))) as {
      bucket?: string;
      items?: Array<{
        key?: string;
        type?: "file" | "folder";
        name?: string;
        size?: number;
        lastModified?: string;
      }>;
    };
    const bucketId = String(body.bucket ?? "").trim();
    const items = Array.isArray(body.items) ? body.items : [];
    if (!bucketId || !items.length) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });
    const targets = items
      .filter((item) => item.key)
      .map((item) => ({
        key: String(item.key),
        type: item.type,
        name: item.name,
        size: item.size,
        lastModified: item.lastModified,
      }));
    if (!targets.length) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });
    const moved = await moveItemsToRecycle(ctx, bucketId, targets);
    return NextResponse.json({ success: true, count: moved.length, items: moved });
  } catch (error) {
    return NextResponse.json({ error: toChineseErrorMessage(error, "移动到回收站失败") }, { status: toStatus(error) });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as { bucket?: string; id?: string; ids?: string[]; action?: string };
    const bucketId = String(body.bucket ?? "").trim();
    const id = String(body.id ?? "").trim();
    const ids = Array.isArray(body.ids) ? body.ids.map((value) => String(value ?? "").trim()).filter(Boolean) : [];
    const action = String(body.action ?? "").trim();
    if (!bucketId || (!id && !ids.length && action !== "clear")) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });

    if (action === "restore") {
      const restoredKey = await restoreRecycleItem(ctx, bucketId, id);
      return NextResponse.json({ success: true, restoredKey });
    }

    if (action === "restore_many") {
      const restoredKeys = await restoreRecycleItems(ctx, bucketId, ids);
      return NextResponse.json({ success: true, count: restoredKeys.length, restoredKeys });
    }

    if (action === "permanent_delete") {
      await permanentlyDeleteRecycleItem(ctx, bucketId, id);
      return NextResponse.json({ success: true });
    }

    if (action === "permanent_delete_many") {
      await permanentlyDeleteRecycleItems(ctx, bucketId, ids);
      return NextResponse.json({ success: true, count: ids.length });
    }

    if (action === "clear") {
      const count = await clearRecycleItems(ctx, bucketId);
      return NextResponse.json({ success: true, count });
    }

    return NextResponse.json({ error: "无效的操作类型" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: toChineseErrorMessage(error, "回收站操作失败") }, { status: toStatus(error) });
  }
}
