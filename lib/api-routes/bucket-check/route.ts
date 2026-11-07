import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, requireAnyPermission } from "@/lib/access-control";
import { createR2Bucket } from "@/lib/r2-s3";
import { resolveBucketCredentials } from "@/lib/user-buckets";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const hintFromR2Error = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  const code = String((error as { code?: unknown; Code?: unknown; name?: unknown })?.Code ?? (error as { code?: unknown }).code ?? (error as { name?: unknown }).name ?? "").trim();
  const message = String((error as { message?: unknown })?.message ?? "").toLowerCase();

  if (code === "NoSuchBucket" || message.includes("nosuchbucket")) return "桶不存在";
  if (code === "AccessDenied" || status === 403 || message.includes("accessdenied")) return "无权限";
  if (code === "InvalidAccessKeyId" || code === "SignatureDoesNotMatch") return "密钥异常";
  if (code) return `S3 错误：${code}`;
  if (status === 404) return "桶不存在或对象不存在";
  if (Number.isFinite(status)) return `请求失败：${status}`;
  return "校验失败";
};

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => toChineseErrorMessage(error, "桶连通性校验失败，请稍后重试。");

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requireAnyPermission(ctx, ["bucket.add", "bucket.edit"], "你没有桶配置权限");

    const { searchParams } = new URL(req.url);
    const bucketId = String(searchParams.get("bucketId") ?? "").trim();
    if (!bucketId) return NextResponse.json({ ok: false, hint: "缺少 bucketId" }, { status: 400 });

    const { creds } = await resolveBucketCredentials(ctx, bucketId);
    const bucket = createR2Bucket(creds);
    await bucket.list({ prefix: "", limit: 1 });

    return NextResponse.json(
      { ok: true, bucketName: creds.bucketName, hint: "连接校验通过", httpStatus: 200 },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error: unknown) {
    const hint = hintFromR2Error(error);
    const status = toStatus(error);
    if (status < 500) {
      return NextResponse.json({ ok: false, hint }, { status, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json(
      { ok: false, hint: toMessage(error) },
      { status, headers: { "cache-control": "no-store" } },
    );
  }
}
