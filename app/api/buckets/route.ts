import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase";
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
    const auth = await requireSupabaseUser(req);
    const buckets = await listUserBucketViews(auth.token);
    return NextResponse.json({ buckets });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSupabaseUser(req);
    const body = (await req.json()) as UpsertBucketInput;
    const bucket = await createUserBucket(auth.token, auth.user.id, body);
    return NextResponse.json({ bucket });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireSupabaseUser(req);
    const body = (await req.json()) as UpsertBucketInput & { id?: string; setDefaultOnly?: boolean };
    const bucketId = String(body.id ?? "").trim();
    if (!bucketId) return NextResponse.json({ error: "缺少存储桶 ID" }, { status: 400 });

    if (body.setDefaultOnly) {
      await setDefaultBucket(auth.token, bucketId);
      const buckets = await listUserBucketViews(auth.token);
      return NextResponse.json({ buckets });
    }

    const patch = { ...body } as UpsertBucketInput & { id?: string; setDefaultOnly?: boolean };
    delete patch.id;
    delete patch.setDefaultOnly;
    const bucket = await updateUserBucket(auth.token, bucketId, patch);
    return NextResponse.json({ bucket });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireSupabaseUser(req);
    const { searchParams } = new URL(req.url);
    const bucketId = String(searchParams.get("id") ?? "").trim();
    if (!bucketId) return NextResponse.json({ error: "缺少存储桶 ID" }, { status: 400 });
    await deleteUserBucket(auth.token, bucketId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}
