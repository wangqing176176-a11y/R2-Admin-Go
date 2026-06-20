import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, requirePermission } from "@/lib/access-control";
import {
  createUserBucket,
  deleteUserBucket,
  listUserBucketViews,
  setDefaultBucket,
  updateUserBucket,
  type UpsertBucketInput,
} from "@/lib/user-buckets";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => toChineseErrorMessage(error, "存储桶操作失败，请稍后重试。");

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "bucket.read", "你没有查看存储桶的权限");
    const buckets = await listUserBucketViews(ctx);
    return NextResponse.json({ buckets });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "bucket.add", "你没有添加存储桶的权限");
    const body = (await req.json()) as UpsertBucketInput;
    const bucket = await createUserBucket(ctx, body);
    return NextResponse.json({ bucket });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "bucket.edit", "你没有编辑存储桶的权限");
    const body = (await req.json()) as UpsertBucketInput & { id?: string; setDefaultOnly?: boolean };
    const bucketId = String(body.id ?? "").trim();
    if (!bucketId) return NextResponse.json({ error: "缺少存储桶 ID" }, { status: 400 });

    if (body.setDefaultOnly) {
      await setDefaultBucket(ctx, bucketId);
      const buckets = await listUserBucketViews(ctx);
      return NextResponse.json({ buckets });
    }

    const patch = { ...body } as UpsertBucketInput & { id?: string; setDefaultOnly?: boolean };
    delete patch.id;
    delete patch.setDefaultOnly;
    const bucket = await updateUserBucket(ctx, bucketId, patch);
    return NextResponse.json({ bucket });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "bucket.edit", "你没有编辑存储桶的权限");
    const { searchParams } = new URL(req.url);
    const bucketId = String(searchParams.get("id") ?? "").trim();
    if (!bucketId) return NextResponse.json({ error: "缺少存储桶 ID" }, { status: 400 });
    await deleteUserBucket(ctx, bucketId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}
