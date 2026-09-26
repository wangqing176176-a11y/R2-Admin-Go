import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, requirePermission } from "@/lib/access-control";
import { assertFolderUnlockedForPath } from "@/lib/folder-locks";
import { buildOnlyOfficePreviewResponse, getOnlyOfficeContentType, type OnlyOfficeMode } from "@/lib/onlyoffice";
import { getPresignedObjectUrl } from "@/lib/r2-s3";
import { issueRouteToken } from "@/lib/route-token";
import { resolveBucketCredentials } from "@/lib/user-buckets";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "object.read", "你没有预览文件的权限");

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const bucketId = String(body.bucket ?? "").trim();
    const key = String(body.key ?? "").trim();
    const fileName = String(body.fileName ?? key.split("/").pop() ?? "").trim();
    const mode: OnlyOfficeMode = body.mode === "edit" ? "edit" : "view";
    if (!bucketId || !key || !fileName) {
      return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });
    }

    const lock = await assertFolderUnlockedForPath(req, ctx, bucketId, key);
    const { creds } = await resolveBucketCredentials(ctx, bucketId);
    if (mode === "edit") requirePermission(ctx, "object.upload", "你没有在线编辑文件的权限");
    const sourceUrl = await getPresignedObjectUrl({
      creds,
      key,
      method: "GET",
      expiresInSeconds: lock ? 30 * 60 : 60 * 60,
    });
    const callbackToken = mode === "edit"
      ? await issueRouteToken({
          op: "onlyoffice-callback",
          creds,
          key,
          contentType: getOnlyOfficeContentType(fileName),
        }, 24 * 60 * 60)
      : "";
    const callbackUrl = callbackToken
      ? `${new URL(req.url).origin}/api/onlyoffice/callback?token=${encodeURIComponent(callbackToken)}`
      : undefined;
    const result = await buildOnlyOfficePreviewResponse({
      sourceUrl,
      fileName,
      stableKey: `${ctx.team.id}:${bucketId}:${key}`,
      userId: ctx.user.id,
      userName: ctx.displayName,
      mode,
      callbackUrl,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    const status = Number((error as { status?: unknown })?.status ?? NaN);
    return NextResponse.json(
      { error: toChineseErrorMessage(error, "ONLYOFFICE 预览配置生成失败") },
      { status: Number.isFinite(status) && status >= 400 ? status : 500 },
    );
  }
}
