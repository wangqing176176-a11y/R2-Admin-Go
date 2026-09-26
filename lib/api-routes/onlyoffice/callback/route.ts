import { NextRequest, NextResponse } from "next/server";
import { requireEnvString } from "@/lib/env";
import { createR2Bucket } from "@/lib/r2-s3";
import { readRouteToken, type OnlyOfficeCallbackRouteToken } from "@/lib/route-token";

export const runtime = "edge";

const jsonResult = (error: 0 | 1) => NextResponse.json({ error });

const assertTrustedDownloadUrl = (rawUrl: unknown) => {
  const downloadUrl = new URL(String(rawUrl ?? ""));
  const documentServerUrl = new URL(requireEnvString("ONLYOFFICE_DOCUMENT_SERVER_URL"));
  if (downloadUrl.protocol !== "https:" && downloadUrl.protocol !== "http:") {
    throw new Error("ONLYOFFICE 保存地址协议无效");
  }
  if (downloadUrl.origin !== documentServerUrl.origin) {
    throw new Error("ONLYOFFICE 保存地址来源无效");
  }
  return downloadUrl.toString();
};

export async function POST(req: NextRequest) {
  try {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    const payload = await readRouteToken<OnlyOfficeCallbackRouteToken>(token, "onlyoffice-callback");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const status = Number(body.status ?? NaN);

    // 2: 文档关闭后已准备保存；6: 用户主动强制保存。
    if (status !== 2 && status !== 6) return jsonResult(0);

    const downloadUrl = assertTrustedDownloadUrl(body.url);
    const source = await fetch(downloadUrl, { cache: "no-store" });
    if (!source.ok || !source.body) throw new Error(`ONLYOFFICE 文件下载失败（${source.status}）`);

    const bucket = createR2Bucket(payload.creds);
    await bucket.put(payload.key, source.body, {
      httpMetadata: { contentType: payload.contentType || "application/octet-stream" },
    });
    return jsonResult(0);
  } catch (error) {
    console.error("ONLYOFFICE callback failed", error);
    return jsonResult(1);
  }
}
