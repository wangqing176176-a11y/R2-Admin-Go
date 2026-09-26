import { NextRequest, NextResponse } from "next/server";
import {
  assertPublicShareNotLocked,
  ensurePublicShareReady,
  getPublicShareRow,
  resolvePublicShareCredentials,
  resolveShareDownloadKey,
  sanitizeShareFileName,
  touchShareAccess,
} from "@/lib/shares";
import { readShareAccessToken } from "@/lib/share-token";
import { getPresignedObjectUrl } from "@/lib/r2-s3";
import { buildOnlyOfficePreviewResponse } from "@/lib/onlyoffice";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const code = String(body.code ?? "").trim();
    const accessToken = String(body.token ?? "").trim();
    const requestedKey = String(body.key ?? "").trim() || null;
    if (!code || !accessToken) {
      return NextResponse.json({ error: "访问凭证已失效，请重新输入提取码。" }, { status: 401 });
    }

    const row = await getPublicShareRow(code);
    if (!row) return NextResponse.json({ error: "分享不存在或已失效" }, { status: 404 });
    await assertPublicShareNotLocked(row);
    const meta = ensurePublicShareReady(row);
    await readShareAccessToken(accessToken, row.id, row.share_code);

    const key = resolveShareDownloadKey(row, requestedKey);
    const fileName = sanitizeShareFileName(key.split("/").pop() || meta.itemName || "preview");
    const creds = await resolvePublicShareCredentials(row);
    const sourceUrl = await getPresignedObjectUrl({ creds, key, method: "GET", expiresInSeconds: 60 * 60 });
    const result = await buildOnlyOfficePreviewResponse({
      sourceUrl,
      fileName,
      stableKey: `share:${row.id}:${key}`,
      userId: `share-${row.id}`,
      userName: "公开分享访客",
      mode: "view",
    });

    void touchShareAccess(row);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    const status = Number((error as { status?: unknown })?.status ?? NaN);
    return NextResponse.json(
      { error: toChineseErrorMessage(error, "ONLYOFFICE 预览配置生成失败") },
      { status: Number.isFinite(status) && status >= 400 ? status : 400 },
    );
  }
}
