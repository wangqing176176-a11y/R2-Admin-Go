import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { join } from "node:path";

const proxyHost = "127.0.0.1";
const proxyPort = 54329;

const readEnvFile = (path) => {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          const key = line.slice(0, index).trim();
          const value = line.slice(index + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
          return [key, value];
        }),
    );
  } catch {
    return {};
  }
};

const fileEnv = readEnvFile(join(process.cwd(), ".env.local"));
const upstream = String(
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
    fileEnv.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    fileEnv.SUPABASE_URL ||
    "",
).replace(/\/$/, "");

if (!upstream.startsWith("https://")) {
  throw new Error(".env.local 缺少有效的 NEXT_PUBLIC_SUPABASE_URL");
}

const upstreamUrl = new URL(upstream);
const upstreamAgent = new HttpsAgent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1, timeout: 65_000 });
const retryableCodes = new Set(["ECONNRESET", "ETIMEDOUT", "EPIPE", "ECONNREFUSED"]);

const requestUpstream = (method, requestUrl, headers, body) => new Promise((resolve, reject) => {
  const outgoing = httpsRequest({
    protocol: upstreamUrl.protocol,
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port || 443,
    family: 4,
    path: requestUrl,
    method,
    headers,
    agent: upstreamAgent,
  }, (incoming) => {
    const chunks = [];
    incoming.on("data", (chunk) => chunks.push(chunk));
    incoming.on("end", () => resolve({
      status: incoming.statusCode || 502,
      headers: incoming.headers,
      body: Buffer.concat(chunks),
    }));
  });
  outgoing.setTimeout(30_000, () => outgoing.destroy(Object.assign(new Error("Supabase request timed out"), { code: "ETIMEDOUT" })));
  outgoing.on("error", reject);
  if (body.length) outgoing.write(body);
  outgoing.end();
});

const requestUpstreamWithRetry = async (method, requestUrl, headers, body) => {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await requestUpstream(method, requestUrl, headers, body);
    } catch (error) {
      lastError = error;
      if (!retryableCodes.has(error?.code) || attempt === 19) throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * Math.min(attempt + 1, 5)));
    }
  }
  throw lastError;
};

const proxy = createServer(async (request, response) => {
  const requestUrl = request.url || "/";
  if (!requestUrl.startsWith("/auth/v1/") && !requestUrl.startsWith("/rest/v1/")) {
    response.writeHead(404).end("Not Found");
    return;
  }

  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const headers = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (!value || ["host", "connection", "content-length", "accept-encoding"].includes(key.toLowerCase())) continue;
      headers[key] = Array.isArray(value) ? value.join(", ") : value;
    }

    if (body.length) headers["content-length"] = String(body.length);
    const upstreamResponse = await requestUpstreamWithRetry(request.method || "GET", requestUrl, headers, body);

    const responseHeaders = {};
    for (const [key, value] of Object.entries(upstreamResponse.headers)) {
      if (["connection", "content-length", "content-encoding", "transfer-encoding"].includes(key.toLowerCase())) continue;
      if (value !== undefined) responseHeaders[key] = value;
    }
    response.writeHead(upstreamResponse.status, responseHeaders);
    response.end(upstreamResponse.body);
  } catch (error) {
    console.error("[supabase-local-proxy]", error);
    response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Supabase local proxy failed" }));
  }
});

proxy.keepAliveTimeout = 65_000;
proxy.listen(proxyPort, proxyHost, () => {
  console.log(`Supabase local proxy: http://${proxyHost}:${proxyPort}`);
  const next = spawn(process.execPath, [join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "dev", ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      // 本地浏览器与 Next 服务端统一经过带重试的代理，避免部分网络环境
      // 直连 Supabase 时出现 connection reset，导致登录一直停在提交状态。
      NEXT_PUBLIC_SUPABASE_URL: `http://${proxyHost}:${proxyPort}`,
      SUPABASE_SERVER_URL: `http://${proxyHost}:${proxyPort}`,
    },
    stdio: "inherit",
  });

  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    next.kill(signal);
    proxy.close(() => process.exit(0));
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  next.on("exit", (code) => proxy.close(() => process.exit(code ?? 0)));
});
