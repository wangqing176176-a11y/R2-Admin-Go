import { NextRequest, NextResponse } from "next/server";
import { requireEnvString } from "@/lib/env";
import { createR2Bucket } from "@/lib/r2-s3";
import { readRouteToken, type OnlyOfficeCallbackRouteToken } from "@/lib/route-token";

export const runtime = "edge";

const jsonResult = (error: 0 | 1) => NextResponse.json({ error });

const MAX_SAVE_BYTES = 64 * 1024 * 1024;

const assertTrustedDownloadUrl = (rawUrl: unknown) => {
  const downloadUrl = new URL(String(rawUrl ?? ""));
  const documentServerUrl = new URL(requireEnvString("ONLYOFFICE_DOCUMENT_SERVER_URL"));
  if (downloadUrl.protocol !== "https:" && downloadUrl.protocol !== "http:") {
    throw new Error("ONLYOFFICE 保存地址协议无效");
  }
  if (downloadUrl.hostname !== documentServerUrl.hostname || downloadUrl.port !== documentServerUrl.port) {
    throw new Error("ONLYOFFICE 保存地址来源无效");
  }
  // 部分反向代理没有把外部 HTTPS 协议传给 Document Server，回调中的下载
  // 地址会被写成同域名的 HTTP。统一改回已配置的公网来源，避免明文回源。
  downloadUrl.protocol = documentServerUrl.protocol;
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
    if (String(body.key ?? "") !== payload.documentKey) {
      throw new Error("ONLYOFFICE 回调文档标识不匹配");
    }

    const downloadUrl = assertTrustedDownloadUrl(body.url);
    const source = await fetch(downloadUrl, { cache: "no-store" });
    if (!source.ok || !source.body) throw new Error(`ONLYOFFICE 文件下载失败（${source.status}）`);

    const declaredSize = Number(source.headers.get("content-length") ?? NaN);
    if (Number.isFinite(declaredSize) && declaredSize > MAX_SAVE_BYTES) {
      throw new Error("ONLYOFFICE 保存文件超过 64MB 限制");
    }
    // 在 Edge 环境中把跨主机响应流直接转交给另一个 fetch 可能在请求结束前被取消。
    // Office 文档限制在 64MB 内后缓冲为 ArrayBuffer，可确保完整写入 R2。
    const file = await source.arrayBuffer();
    if (file.byteLength > MAX_SAVE_BYTES) throw new Error("ONLYOFFICE 保存文件超过 64MB 限制");

    const bucket = createR2Bucket(payload.creds);
    await bucket.put(payload.key, file, {
      httpMetadata: { contentType: payload.contentType || "application/octet-stream" },
    });
    console.info("ONLYOFFICE callback saved", { status, bytes: file.byteLength });
    return jsonResult(0);
  } catch (error) {
    console.error("ONLYOFFICE callback failed", error);
    return jsonResult(1);
  }
}
