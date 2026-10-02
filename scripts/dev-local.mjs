import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { join } from "node:path";
import WebSocket, { WebSocketServer } from "ws";

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
const upstreamAgent = new HttpsAgent({ keepAlive: true, maxSockets: 8, maxFreeSockets: 4, timeout: 65_000 });
const retryableCodes = new Set(["ECONNRESET", "ETIMEDOUT", "EPIPE", "ECONNREFUSED"]);
const realtimeWebSocketServer = new WebSocketServer({ noServer: true, perMessageDeflate: false });

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

const parseWebSocketProtocols = (header) => String(header || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const normalizeWebSocketCloseCode = (code) => (
  code >= 1000 && code <= 4999 && ![1004, 1005, 1006, 1015].includes(code) ? code : 1000
);

const normalizeWebSocketCloseReason = (reason) => Buffer.from(reason || "").subarray(0, 123);

const openRealtimeUpstream = (requestUrl, protocols) => new Promise((resolve, reject) => {
  const target = new URL(requestUrl, upstreamUrl);
  target.protocol = "wss:";
  const options = {
    handshakeTimeout: 30_000,
    perMessageDeflate: false,
    headers: { Origin: upstreamUrl.origin },
  };
  const socket = protocols.length > 0
    ? new WebSocket(target, protocols, options)
    : new WebSocket(target, options);
  let settled = false;
  const fail = (error) => {
    if (settled) return;
    settled = true;
    socket.terminate();
    reject(error);
  };
  socket.once("open", () => {
    if (settled) return;
    settled = true;
    resolve(socket);
  });
  socket.once("error", fail);
  socket.once("unexpected-response", (_request, response) => {
    fail(new Error(`Realtime upstream rejected the WebSocket handshake (${response.statusCode || "unknown"})`));
  });
  socket.once("close", (code) => {
    if (!settled) fail(new Error(`Realtime upstream closed during handshake (${code})`));
  });
});

proxy.on("upgrade", (request, socket, head) => {
  const requestUrl = request.url || "/";
  if (!requestUrl.startsWith("/realtime/v1/websocket")) {
    socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    return;
  }

  realtimeWebSocketServer.handleUpgrade(request, socket, head, (client) => {
    const protocols = parseWebSocketProtocols(request.headers["sec-websocket-protocol"]);
    const pendingMessages = [];
    let upstreamSocket = null;
    let stopped = false;

    client.on("message", (data, isBinary) => {
      if (upstreamSocket?.readyState === WebSocket.OPEN) {
        upstreamSocket.send(data, { binary: isBinary });
      } else if (pendingMessages.length < 100) {
        pendingMessages.push({ data, isBinary });
      }
    });
    client.on("close", (code, reason) => {
      stopped = true;
      if (upstreamSocket?.readyState === WebSocket.OPEN) {
        upstreamSocket.close(normalizeWebSocketCloseCode(code), normalizeWebSocketCloseReason(reason));
      }
      else upstreamSocket?.terminate();
    });
    client.on("error", () => {
      stopped = true;
      upstreamSocket?.terminate();
    });

    void (async () => {
      let lastError = null;
      for (let attempt = 0; attempt < 20 && !stopped; attempt += 1) {
        try {
          upstreamSocket = await openRealtimeUpstream(requestUrl, protocols);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < 19) await new Promise((resolve) => setTimeout(resolve, 80 * Math.min(attempt + 1, 8)));
        }
      }

      if (stopped) {
        upstreamSocket?.terminate();
        return;
      }
      if (!upstreamSocket || lastError) {
        console.error("[supabase-realtime-proxy] WebSocket connection failed", lastError);
        client.close(1011, "Realtime upstream unavailable");
        return;
      }

      upstreamSocket.on("message", (data, isBinary) => {
        if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
      });
      upstreamSocket.on("close", (code, reason) => {
        if (client.readyState !== WebSocket.OPEN) return;
        client.close(normalizeWebSocketCloseCode(code), normalizeWebSocketCloseReason(reason));
      });
      upstreamSocket.on("error", (error) => {
        console.error("[supabase-realtime-proxy] Active WebSocket failed", error);
        if (client.readyState === WebSocket.OPEN) client.close(1011, "Realtime upstream failed");
      });
      for (const message of pendingMessages.splice(0)) {
        if (upstreamSocket.readyState !== WebSocket.OPEN) break;
        upstreamSocket.send(message.data, { binary: message.isBinary });
      }
    })();
  });
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
      // Realtime also uses the local proxy so unstable direct Supabase WebSocket
      // connections get the same bounded connection retry as auth/REST traffic.
      NEXT_PUBLIC_SUPABASE_REALTIME_URL: `http://${proxyHost}:${proxyPort}`,
      SUPABASE_SERVER_URL: `http://${proxyHost}:${proxyPort}`,
      SUPABASE_AUTH_CACHE_TTL_MS: "300000",
      APP_ACCESS_CTX_CACHE_TTL_MS: "300000",
      USER_BUCKET_DETAIL_CACHE_TTL_MS: "300000",
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
