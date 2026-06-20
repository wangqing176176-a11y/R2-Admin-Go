import { NextRequest, NextResponse } from "next/server";
import {
  getPublicShareRow,
  ensurePublicShareReady,
  issueDownloadRedirectUrl,
  resolvePublicShareCredentials,
  resolveShareDownloadKey,
  sanitizeShareFileName,
  touchShareAccess,
  assertPublicShareNotLocked,
} from "@/lib/shares";
import { readShareAccessToken } from "@/lib/share-token";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const json = (status: number, obj: unknown) => NextResponse.json(obj, { status });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = String(searchParams.get("code") ?? "").trim();
    const accessToken = String(searchParams.get("token") ?? "").trim();
    const key = searchParams.get("key");
    const forceDownload = String(searchParams.get("download") ?? "1").trim() !== "0";
    const forceProxy = String(searchParams.get("forceProxy") ?? "0").trim() === "1";
    const returnJsonUrl = String(searchParams.get("as") ?? "").trim().toLowerCase() === "json";

    if (!code) return json(400, { error: "缺少分享码" });
    if (!accessToken) return json(401, { error: "访问凭证已失效，请重新输入提取码。" });

    const row = await getPublicShareRow(code);
    if (!row) return json(404, { error: "分享不存在或已失效" });
    await assertPublicShareNotLocked(row);
    const meta = ensurePublicShareReady(row);

    await readShareAccessToken(accessToken, row.id, row.share_code);

    const downloadKey = resolveShareDownloadKey(row, key);
    const filename = sanitizeShareFileName(downloadKey.split("/").pop() || meta.itemName || "download");

    const creds = await resolvePublicShareCredentials(row);
    const origin = new URL(req.url).origin;
    const redirectUrl = await issueDownloadRedirectUrl(origin, creds, downloadKey, filename, forceDownload, forceProxy);

    void touchShareAccess(row);
    if (returnJsonUrl) {
      return json(200, { url: redirectUrl });
    }
    return NextResponse.redirect(redirectUrl, { status: 302 });
  } catch (error: unknown) {
    const msg = toChineseErrorMessage(error, "下载分享文件失败，请稍后重试。");
    return json(400, { error: msg || "下载分享文件失败" });
  }
}
