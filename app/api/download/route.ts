import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireSupabaseUser } from "@/lib/supabase";
import { createS3Client } from "@/lib/r2-s3";
import { issueRouteToken } from "@/lib/route-token";
import { resolveBucketCredentials } from "@/lib/user-buckets";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const encodeRFC5987ValueChars = (value: string) =>
  encodeURIComponent(value)
    .replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, "%2A");

const buildContentDisposition = (filename: string, kind: "attachment" | "inline") => {
  const safeFallback = filename.replace(/[\/\\"]/g, "_");
  const encoded = encodeRFC5987ValueChars(filename);
  return `${kind}; filename="${safeFallback}"; filename*=UTF-8''${encoded}`;
};

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => toChineseErrorMessage(error, "下载链接生成失败，请稍后重试。");

const maybeGetPresignedUrl = async (opts: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  key: string;
  download: boolean;
  filename: string;
}) => {
  const s3 = createS3Client({
    accountId: opts.accountId,
    accessKeyId: opts.accessKeyId,
    secretAccessKey: opts.secretAccessKey,
    bucketName: opts.bucketName,
  });

  const cmd = new GetObjectCommand({
    Bucket: opts.bucketName,
    Key: opts.key,
    ...(opts.filename
      ? { ResponseContentDisposition: buildContentDisposition(opts.filename, opts.download ? "attachment" : "inline") }
      : {}),
  });

  return await getSignedUrl(s3, cmd, { expiresIn: 24 * 3600 });
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSupabaseUser(req);
    const { searchParams } = new URL(req.url);

    const bucketId = searchParams.get("bucket");
    const key = searchParams.get("key");
    const download = searchParams.get("download") === "1";
    const forceProxy = searchParams.get("forceProxy") === "1";
    const filename = searchParams.get("filename") ?? "";

    if (!bucketId || !key) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });

    const { creds } = await resolveBucketCredentials(auth.token, bucketId);

    if (!forceProxy) {
      try {
        const presigned = await maybeGetPresignedUrl({
          accountId: creds.accountId,
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          bucketName: creds.bucketName,
          key,
          download,
          filename: filename || key.split("/").pop() || "download",
        });

        if (presigned) return NextResponse.json({ url: presigned });
      } catch {
        // Fall back to proxy mode.
      }
    }

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
