import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireSupabaseUser } from "@/lib/supabase";
import { createS3Client } from "@/lib/r2-s3";
import { resolveBucketCredentials } from "@/lib/user-buckets";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const isValidBucketName = (name: string) => /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/i.test(name);

const parseS3ErrorCode = (body: string) => {
  const m = body.match(/<Code>([^<]+)<\/Code>/i);
  return m?.[1]?.trim() || "";
};

const hintFromS3Error = (code: string, httpStatus: number) => {
  if (code === "NoSuchBucket") return "桶不存在";
  if (code === "AccessDenied") return "无权限";
  if (code === "InvalidAccessKeyId" || code === "SignatureDoesNotMatch") return "密钥异常";
  if (code) return `S3 错误：${code}`;
  if (httpStatus === 403) return "无权限";
  if (httpStatus === 404) return "桶不存在或对象不存在";
  return `请求失败：${httpStatus}`;
};

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => toChineseErrorMessage(error, "桶连通性校验失败，请稍后重试。");

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSupabaseUser(req);
    const { searchParams } = new URL(req.url);
    const bucketId = String(searchParams.get("bucketId") ?? "").trim();
    const bucketNameOverride = String(searchParams.get("bucketName") ?? "").trim();
    if (!bucketId) return NextResponse.json({ ok: false, hint: "缺少 bucketId" }, { status: 400 });

    const { creds } = await resolveBucketCredentials(auth.token, bucketId);
    const bucketName = bucketNameOverride || creds.bucketName;

    if (!bucketName) return NextResponse.json({ ok: false, hint: "缺少桶名" }, { status: 400 });
    if (!isValidBucketName(bucketName)) return NextResponse.json({ ok: false, hint: "桶名格式不正确" }, { status: 400 });

    const s3 = createS3Client({
      accountId: creds.accountId,
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      bucketName,
    });

    const checkKey = `.r2admin_bucket_check_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const cmd = new GetObjectCommand({ Bucket: bucketName, Key: checkKey });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 60 });

    const res = await fetch(url, { headers: { Range: "bytes=0-0" } });
    if (res.ok) {
      return NextResponse.json(
        { ok: true, bucketName, hint: "桶名校验通过", httpStatus: res.status },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const body = await res.text().catch(() => "");
    const code = parseS3ErrorCode(body.slice(0, 4096));
    if (code === "NoSuchKey") {
      return NextResponse.json(
        { ok: true, bucketName, hint: "桶名校验通过", httpStatus: res.status, code },
        { headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: false, bucketName, hint: hintFromS3Error(code, res.status), httpStatus: res.status, code },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, hint: toMessage(error) },
      { status: toStatus(error), headers: { "cache-control": "no-store" } },
    );
  }
}
