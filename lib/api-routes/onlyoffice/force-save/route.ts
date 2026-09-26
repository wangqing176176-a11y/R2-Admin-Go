import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, requirePermission } from "@/lib/access-control";
import { assertFolderUnlockedForPath } from "@/lib/folder-locks";
import { createOnlyOfficeDocumentKey, requestOnlyOfficeForceSave } from "@/lib/onlyoffice";
import { createR2Bucket } from "@/lib/r2-s3";
import { resolveBucketCredentials } from "@/lib/user-buckets";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const wait = async (milliseconds: number) => {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
};

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "object.read", "你没有读取文件的权限");
    requirePermission(ctx, "preview.online", "你没有在线预览权限");
    requirePermission(ctx, "object.upload", "你没有在线编辑文件的权限");
    requirePermission(ctx, "editor.online.save", "你没有在线编辑保存权限");

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const bucketId = String(body.bucket ?? "").trim();
    const key = String(body.key ?? "").trim();
    const documentKey = String(body.documentKey ?? "").trim();
    const sourceEtag = String(body.sourceEtag ?? "").trim();
    const action = body.action === "status" ? "status" : "force-save";
    if (!bucketId || !key || !documentKey || !sourceEtag) {
      return NextResponse.json({ error: "ONLYOFFICE 保存参数不完整" }, { status: 400 });
    }

    await assertFolderUnlockedForPath(req, ctx, bucketId, key);
    const { creds } = await resolveBucketCredentials(ctx, bucketId);
    const expectedDocumentKey = await createOnlyOfficeDocumentKey(`${ctx.team.id}:${bucketId}:${key}:${sourceEtag}`);
    if (documentKey !== expectedDocumentKey) {
      return NextResponse.json({ error: "ONLYOFFICE 编辑会话已失效，请重新打开文件" }, { status: 409 });
    }

    const bucket = createR2Bucket(creds);
    const before = await bucket.head(key);
    if (!before) return NextResponse.json({ error: "源文件不存在或已被删除" }, { status: 404 });
    const baselineEtag = String(before.etag ?? sourceEtag);

    if (action === "status") {
      const changed = Boolean(baselineEtag && baselineEtag !== sourceEtag);
      return NextResponse.json({ saved: changed, changed });
    }

    const command = await requestOnlyOfficeForceSave(documentKey);
    if (command.noChanges) {
      return NextResponse.json({ saved: true, changed: baselineEtag !== sourceEtag });
    }

    // 强制保存会异步调用 callback。等待 R2 ETag 改变后才向界面报告成功。
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await wait(750);
      const current = await bucket.head(key);
      if (current?.etag && current.etag !== baselineEtag) {
        return NextResponse.json({ saved: true, changed: true });
      }
    }

    return NextResponse.json(
      { saved: false, error: "ONLYOFFICE 已接收保存请求，但 R2 尚未完成写入，请稍后重试" },
      { status: 202 },
    );
  } catch (error: unknown) {
    const status = Number((error as { status?: unknown })?.status ?? NaN);
    return NextResponse.json(
      { error: toChineseErrorMessage(error, "ONLYOFFICE 保存失败，请重试") },
      { status: Number.isFinite(status) && status >= 400 ? status : 500 },
    );
  }
}
