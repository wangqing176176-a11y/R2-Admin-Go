import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, requireAnyPermission } from "@/lib/access-control";
import { toChineseErrorMessage } from "@/lib/error-zh";
import {
  createStorageOAuthAuthorizationUrl,
  exchangeStorageOAuthCallback,
  isStorageOAuthProvider,
  readStorageOAuthCallbackState,
  type StorageOAuthProvider,
} from "@/lib/storage-oauth";

export const runtime = "edge";

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => toChineseErrorMessage(error, "云盘授权失败，请稍后重试。");

const callbackHtml = (input: {
  openerOrigin?: string;
  provider?: StorageOAuthProvider;
  ok: boolean;
  grantToken?: string;
  error?: string;
}) => {
  const message = JSON.stringify({
    type: "storage-oauth-result",
    ok: input.ok,
    provider: input.provider,
    grantToken: input.grantToken,
    error: input.error,
  }).replaceAll("<", "\\u003c");
  const origin = JSON.stringify(input.openerOrigin ?? "").replaceAll("<", "\\u003c");
  const title = input.ok ? "授权成功" : "授权失败";
  const detail = input.ok ? "账号已连接，可以关闭此窗口。" : String(input.error ?? "请返回应用后重试。");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#0f172a}.card{max-width:28rem;margin:1rem;padding:2rem;border:1px solid #e2e8f0;border-radius:1rem;background:#fff;box-shadow:0 12px 35px #0f172a12}h1{margin:0 0 .75rem;font-size:1.35rem}p{margin:0;color:#475569;line-height:1.7;word-break:break-word}</style></head><body><main class="card"><h1>${title}</h1><p>${detail.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p></main><script>const target=${origin};if(window.opener&&target){window.opener.postMessage(${message},target);setTimeout(()=>window.close(),250)}</script></body></html>`;
};

const htmlResponse = (html: string, status = 200) => new Response(html, {
  status,
  headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
  },
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requireAnyPermission(ctx, ["bucket.add", "bucket.edit"], "你没有存储连接配置权限");
    const body = await req.json() as { provider?: unknown };
    if (!isStorageOAuthProvider(body.provider)) {
      return NextResponse.json({ error: "该存储平台不支持一键授权" }, { status: 400 });
    }
    const authorizationUrl = await createStorageOAuthAuthorizationUrl(body.provider, ctx, req.url);
    return NextResponse.json({ authorizationUrl }, { headers: { "cache-control": "no-store" } });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stateToken = String(searchParams.get("state") ?? "").trim();
  let callbackState: Awaited<ReturnType<typeof readStorageOAuthCallbackState>> | undefined;
  try {
    if (!stateToken) throw new Error("缺少 OAuth 授权状态，请重新登录");
    callbackState = await readStorageOAuthCallbackState(stateToken);
    const providerError = String(searchParams.get("error_description") ?? searchParams.get("error") ?? "").trim();
    if (providerError) throw new Error(providerError === "access_denied" ? "你已取消授权" : providerError);
    const code = String(searchParams.get("code") ?? "").trim();
    if (!code) throw new Error("授权平台未返回授权码，请重新登录");
    const result = await exchangeStorageOAuthCallback({ code, state: stateToken });
    return htmlResponse(callbackHtml({ ...result, ok: true }));
  } catch (error: unknown) {
    const message = toMessage(error);
    return htmlResponse(callbackHtml({ ...callbackState, ok: false, error: message }), 400);
  }
}
