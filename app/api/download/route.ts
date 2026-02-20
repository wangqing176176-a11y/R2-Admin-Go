import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, requirePermission } from "@/lib/access-control";
import { issueRouteToken } from "@/lib/route-token";
import { resolveBucketCredentials } from "@/lib/user-buckets";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => toChineseErrorMessage(error, "下载链接生成失败，请稍后重试。");

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "object.read", "你没有下载文件的权限");

    const { searchParams } = new URL(req.url);
    const bucketId = searchParams.get("bucket");
    const key = searchParams.get("key");
    const download = searchParams.get("download") === "1";
    const filename = searchParams.get("filename") ?? "";

    if (!bucketId || !key) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });

    const { creds } = await resolveBucketCredentials(ctx, bucketId);

    const origin = new URL(req.url).origin;
    const token = await issueRouteToken(
      {
        op: "object",
        creds,
        key,
        download,
      },
      24 * 3600,
    );

    const url = `${origin}/api/object?token=${encodeURIComponent(token)}${
      filename ? `&filename=${encodeURIComponent(filename)}` : ""
    }`;

    return NextResponse.json({ url });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}
