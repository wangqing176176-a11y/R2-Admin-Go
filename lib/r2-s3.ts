export type R2ObjectSummaryLike = {
  key: string;
  size?: number;
  uploaded?: string;
};

export type R2ListResultLike = {
  objects?: R2ObjectSummaryLike[];
  delimitedPrefixes?: string[];
  truncated?: boolean;
  cursor?: string;
};

export type R2HeadResultLike = {
  size?: number;
  etag?: string;
};

export type R2HttpMetadataLike = {
  contentType?: string;
};

export type R2GetResultLike = {
  body: BodyInit | null;
  size?: number;
  etag?: string;
  httpEtag?: string;
  httpMetadata?: R2HttpMetadataLike;
  customMetadata?: unknown;
};

export type R2MultipartPartResultLike = {
  etag?: string;
};

export type R2MultipartUploadLike = {
  uploadPart: (partNumber: number, body: unknown) => Promise<R2MultipartPartResultLike>;
  complete: (parts: Array<{ etag: string; partNumber: number }>) => Promise<unknown>;
  abort: () => Promise<unknown>;
};

export type R2BucketLike = {
  list: (options: { prefix?: string; delimiter?: string; cursor?: string; limit?: number }) => Promise<R2ListResultLike>;
  get: (key: string, options?: { range?: { offset: number; length: number } }) => Promise<R2GetResultLike | null>;
  head: (key: string) => Promise<R2HeadResultLike | null>;
  put: (key: string, value: unknown, options?: Record<string, unknown>) => Promise<{ etag?: string } | undefined>;
  delete: (keyOrKeys: string | string[]) => Promise<unknown>;
  createMultipartUpload?: (key: string, options?: Record<string, unknown>) => Promise<{ uploadId: string }>;
  resumeMultipartUpload?: (key: string, uploadId: string) => R2MultipartUploadLike;
};

export type R2ClientCredentials = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

export type PresignedObjectInput = {
  creds: R2ClientCredentials;
  key: string;
  method?: "GET" | "HEAD" | "PUT";
  query?: Record<string, QueryValue>;
  expiresInSeconds?: number;
  responseContentDisposition?: string;
};

type R2ErrorLike = Error & {
  status?: number;
  code?: string;
  Code?: string;
};

type QueryValue = string | number | boolean | null | undefined;

const AWS_ALGORITHM = "AWS4-HMAC-SHA256";
const AWS_REGION = "auto";
const AWS_SERVICE = "s3";
const AWS_REQUEST = "aws4_request";
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

const textEncoder = new TextEncoder();

export const createS3Client = (creds: R2ClientCredentials) => ({
  endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
  ...creds,
});

const stripEtag = (etag?: string | null) => {
  const v = String(etag ?? "").trim();
  return v.replace(/^\"|\"$/g, "");
};

const readErrorStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) ? status : undefined;
};

const readErrorName = (error: unknown) => {
  const e = error as { name?: unknown; code?: unknown; Code?: unknown };
  return String(e?.name ?? e?.Code ?? e?.code ?? "").trim();
};

const readErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error ?? "");

const toFriendlyR2Message = (error: unknown, action: string) => {
  const name = readErrorName(error);
  const status = readErrorStatus(error);
  const message = readErrorMessage(error);
  const normalized = `${name} ${message}`.toLowerCase();

  if (normalized.includes("invalidaccesskeyid")) {
    return "Access Key ID 填写错误，请检查 Access Key ID。";
  }
  if (normalized.includes("signaturedoesnotmatch")) {
    return "签名校验失败：Secret Access Key、Account ID 或桶名可能填写错误。";
  }
  if (normalized.includes("nosuchbucket")) {
    return "桶名错误：该桶不存在，请检查 R2 桶名称。";
  }
  if (normalized.includes("nosuchupload")) {
    return "分片上传会话已失效，请重试上传（系统会自动重建会话）。";
  }
  if (normalized.includes("accessdenied") || status === 403) {
    return "访问被拒绝：请检查密钥权限、Account ID 与桶权限设置。";
  }
  if (normalized.includes("authorizationheadermalformed")) {
    return "鉴权格式错误：Account ID 或签名参数可能不正确。";
  }
  if (normalized.includes("requesttimetooskewed")) {
    return "系统时间偏差过大导致签名失败，请同步本机时间后重试。";
  }
  if (status === 404) {
    return "目标资源不存在：请检查桶名、路径或文件名。";
  }
  if (message) return `R2 ${action}失败：${message}`;
  return `R2 ${action}失败，请检查桶配置与密钥。`;
};

const toFriendlyR2Error = (error: unknown, action: string) => {
  const e = new Error(toFriendlyR2Message(error, action)) as R2ErrorLike;
  const status = readErrorStatus(error);
  const code = readErrorName(error);
  if (status) e.status = status;
  if (code) {
    e.name = code;
    e.code = code;
    e.Code = code;
  }
  return e;
};

const toHex = (bytes: Uint8Array) => Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

const formatAmzDate = (date: Date) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return {
    amzDate: `${y}${m}${d}T${hh}${mm}${ss}Z`,
    dateStamp: `${y}${m}${d}`,
  };
};

const ensureSubtle = () => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("当前运行环境不支持 WebCrypto");
  return subtle;
};

const asBytes = async (value: string | Uint8Array | ArrayBuffer): Promise<Uint8Array> => {
  if (typeof value === "string") return textEncoder.encode(value);
  if (value instanceof Uint8Array) return value;
  return new Uint8Array(value);
};

const sha256Hex = async (value: string | Uint8Array | ArrayBuffer) => {
  const subtle = ensureSubtle();
  const bytes = await asBytes(value);
  const digest = await subtle.digest("SHA-256", bytes as BufferSource);
  return toHex(new Uint8Array(digest));
};

const hmacSha256 = async (key: Uint8Array | ArrayBuffer, value: string | Uint8Array) => {
  const subtle = ensureSubtle();
  const rawKey = key instanceof Uint8Array ? key : new Uint8Array(key);
  const cryptoKey = await subtle.importKey("raw", rawKey as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const msg = typeof value === "string" ? textEncoder.encode(value) : value;
  const signed = await subtle.sign("HMAC", cryptoKey, msg as BufferSource);
  return new Uint8Array(signed);
};

const deriveSigningKey = async (secretAccessKey: string, dateStamp: string) => {
  const kDate = await hmacSha256(textEncoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, AWS_REGION);
  const kService = await hmacSha256(kRegion, AWS_SERVICE);
  return await hmacSha256(kService, AWS_REQUEST);
};

const encodeRfc3986 = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);

const encodePath = (path: string) => path.split("/").map((p) => encodeRfc3986(p)).join("/");

const buildCanonicalQuery = (query?: Record<string, QueryValue>) => {
  const pairs: Array<[string, string]> = [];
  if (query) {
    for (const [key, raw] of Object.entries(query)) {
      if (raw === undefined || raw === null) continue;
      pairs.push([encodeRfc3986(key), encodeRfc3986(String(raw))]);
    }
  }
  pairs.sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1));
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
};

const normalizeObjectKey = (key: string) => {
  let normalized = String(key ?? "");
  while (normalized.startsWith("/")) normalized = normalized.slice(1);
  return normalized;
};

const parseXmlTag = (xml: string, tag: string): string | undefined => {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m?.[1]) return undefined;
  return m[1]
    .trim()
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
};

const createHttpError = async (action: string, res: Response): Promise<R2ErrorLike> => {
  const text = await res.text().catch(() => "");
  const code = parseXmlTag(text, "Code") || "";
  const message = parseXmlTag(text, "Message") || text.trim() || `${res.status}`;
  const err = new Error(message || `R2 ${action}失败`) as R2ErrorLike;
  err.status = res.status;
  if (code) {
    err.name = code;
    err.code = code;
    err.Code = code;
  }
  return err;
};

const normalizeMetadata = (value: unknown) => {
  if (!value || typeof value !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!k) continue;
    if (v === undefined || v === null) continue;
    out[k] = String(v);
  }
  return Object.keys(out).length ? out : undefined;
};

const asBodyInit = async (body: unknown): Promise<BodyInit | null> => {
  if (!body) return null;
  if (typeof body === "string") return body;
  if (body instanceof Blob) return body;
  if (body instanceof ReadableStream) return body;
  if (body instanceof Uint8Array) return body as unknown as BodyInit;
  if (body instanceof ArrayBuffer) return new Uint8Array(body) as unknown as BodyInit;

  const maybe = body as {
    transformToWebStream?: () => ReadableStream;
    transformToByteArray?: () => Promise<Uint8Array>;
    arrayBuffer?: () => Promise<ArrayBuffer>;
    [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
  };

  if (typeof maybe.transformToWebStream === "function") {
    return maybe.transformToWebStream();
  }

  if (typeof maybe.transformToByteArray === "function") {
    return (await maybe.transformToByteArray()) as unknown as BodyInit;
  }

  if (typeof maybe.arrayBuffer === "function") {
    return new Uint8Array(await maybe.arrayBuffer()) as unknown as BodyInit;
  }

  if (typeof maybe[Symbol.asyncIterator] === "function") {
    const chunks: Uint8Array[] = [];
    let total = 0;

    const asChunk = (value: unknown): Uint8Array | null => {
      if (value instanceof Uint8Array) return value;
      if (value instanceof ArrayBuffer) return new Uint8Array(value);
      if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      if (typeof value === "string") return textEncoder.encode(value);
      return null;
    };

    for await (const chunk of body as AsyncIterable<unknown>) {
      const bytes = asChunk(chunk);
      if (!bytes) continue;
      chunks.push(bytes);
      total += bytes.byteLength;
    }

    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out as unknown as BodyInit;
  }

  return body as BodyInit;
};

const bodyToPayloadHash = async (body: BodyInit | null, unsignedPayload: boolean) => {
  if (unsignedPayload || body == null) return UNSIGNED_PAYLOAD;
  if (typeof body === "string") return await sha256Hex(body);
  if (body instanceof Uint8Array) return await sha256Hex(body);
  if (body instanceof ArrayBuffer) return await sha256Hex(body);
  if (ArrayBuffer.isView(body)) return await sha256Hex(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  if (body instanceof Blob) return await sha256Hex(await body.arrayBuffer());
  if (body instanceof ReadableStream) return UNSIGNED_PAYLOAD;
  return UNSIGNED_PAYLOAD;
};

const signedFetch = async (opts: {
  creds: R2ClientCredentials;
  method: "GET" | "HEAD" | "POST" | "PUT" | "DELETE";
  key?: string;
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  unsignedPayload?: boolean;
}) => {
  const method = opts.method.toUpperCase() as "GET" | "HEAD" | "POST" | "PUT" | "DELETE";
  const host = `${opts.creds.accountId}.r2.cloudflarestorage.com`;
  const baseUrl = `https://${host}`;
  const objectKey = normalizeObjectKey(String(opts.key ?? ""));
  const pathRaw = objectKey ? `/${opts.creds.bucketName}/${objectKey}` : `/${opts.creds.bucketName}`;
  const canonicalUri = encodePath(pathRaw);
  const canonicalQuery = buildCanonicalQuery(opts.query);

  const body = opts.body ?? null;
  const payloadHash = await bodyToPayloadHash(body, Boolean(opts.unsignedPayload));
  const now = new Date();
  const { amzDate, dateStamp } = formatAmzDate(now);

  const headers = new Map<string, string>();
  headers.set("host", host);
  headers.set("x-amz-content-sha256", payloadHash);
  headers.set("x-amz-date", amzDate);

  for (const [k, v] of Object.entries(opts.headers ?? {})) {
    if (v === undefined || v === null) continue;
    const key = String(k).toLowerCase();
    const value = String(v).trim().replace(/\s+/g, " ");
    if (!key) continue;
    headers.set(key, value);
  }

  const sortedHeaderKeys = Array.from(headers.keys()).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${headers.get(k) ?? ""}\n`).join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${AWS_REGION}/${AWS_SERVICE}/${AWS_REQUEST}`;
  const stringToSign = [
    AWS_ALGORITHM,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveSigningKey(opts.creds.secretAccessKey, dateStamp);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));
  const authorization = `${AWS_ALGORITHM} Credential=${opts.creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const requestHeaders = new Headers();
  for (const [k, v] of headers.entries()) {
    if (k === "host") continue;
    requestHeaders.set(k, v);
  }
  requestHeaders.set("authorization", authorization);

  const url = `${baseUrl}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
  return await fetch(url, {
    method,
    headers: requestHeaders,
    body: body == null ? undefined : body,
  });
};

export const getPresignedObjectUrl = async (input: PresignedObjectInput): Promise<string> => {
  const method = (input.method ?? "GET").toUpperCase() as "GET" | "HEAD" | "PUT";
  const host = `${input.creds.accountId}.r2.cloudflarestorage.com`;
  const objectKey = normalizeObjectKey(input.key);
  const canonicalUri = encodePath(`/${input.creds.bucketName}/${objectKey}`);

  const now = new Date();
  const { amzDate, dateStamp } = formatAmzDate(now);
  const expires = Math.max(1, Math.min(7 * 24 * 3600, Math.floor(Number(input.expiresInSeconds ?? 3600) || 3600)));
  const credentialScope = `${dateStamp}/${AWS_REGION}/${AWS_SERVICE}/${AWS_REQUEST}`;

  const query: Record<string, QueryValue> = {
    "X-Amz-Algorithm": AWS_ALGORITHM,
    "X-Amz-Credential": `${input.creds.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": expires,
    "X-Amz-SignedHeaders": "host",
  };
  for (const [k, v] of Object.entries(input.query ?? {})) {
    if (v === undefined || v === null || k.length === 0) continue;
    query[k] = v;
  }
  if (input.responseContentDisposition) {
    query["response-content-disposition"] = input.responseContentDisposition;
  }

  const canonicalQuery = buildCanonicalQuery(query);
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, "host", UNSIGNED_PAYLOAD].join("\n");
  const stringToSign = [AWS_ALGORITHM, amzDate, credentialScope, await sha256Hex(canonicalRequest)].join("\n");
  const signingKey = await deriveSigningKey(input.creds.secretAccessKey, dateStamp);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  const finalQuery = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  return `https://${host}${canonicalUri}?${finalQuery}`;
};

const listFromXml = (xml: string): R2ListResultLike => {
  const objects: R2ObjectSummaryLike[] = [];
  const contentRe = /<Contents>([\s\S]*?)<\/Contents>/gi;
  for (;;) {
    const m = contentRe.exec(xml);
    if (!m?.[1]) break;
    const block = m[1];
    const key = parseXmlTag(block, "Key");
    if (!key) continue;
    const sizeRaw = parseXmlTag(block, "Size");
    const timeRaw = parseXmlTag(block, "LastModified");
    const size = Number(sizeRaw ?? NaN);
    const uploaded = timeRaw ? new Date(timeRaw).toISOString() : undefined;
    objects.push({
      key,
      size: Number.isFinite(size) ? size : undefined,
      uploaded: uploaded && !Number.isNaN(Date.parse(uploaded)) ? uploaded : undefined,
    });
  }

  const delimitedPrefixes: string[] = [];
  const prefixRe = /<CommonPrefixes>([\s\S]*?)<\/CommonPrefixes>/gi;
  for (;;) {
    const m = prefixRe.exec(xml);
    if (!m?.[1]) break;
    const p = parseXmlTag(m[1], "Prefix");
    if (p) delimitedPrefixes.push(p);
  }

  const isTruncated = /^true$/i.test(parseXmlTag(xml, "IsTruncated") ?? "");
  const nextToken = parseXmlTag(xml, "NextContinuationToken") || undefined;

  return {
    objects,
    delimitedPrefixes,
    truncated: isTruncated,
    cursor: nextToken,
  };
};

const parseMetadataFromHeaders = (headers: Headers) => {
  const metadata: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    if (!key.toLowerCase().startsWith("x-amz-meta-")) continue;
    metadata[key.slice(11)] = value;
  }
  return Object.keys(metadata).length ? metadata : undefined;
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const createR2Bucket = (creds: R2ClientCredentials): R2BucketLike => {
  const bucketCreds = { ...creds };

  return {
    list: async ({ prefix, delimiter, cursor, limit }) => {
      try {
        const res = await signedFetch({
          creds: bucketCreds,
          method: "GET",
          query: {
            "list-type": 2,
            prefix: prefix || undefined,
            delimiter: delimiter || undefined,
            "continuation-token": cursor || undefined,
            "max-keys": limit ?? 1000,
          },
          unsignedPayload: true,
        });
        if (!res.ok) throw await createHttpError("读取文件列表", res);
        const xml = await res.text();
        return listFromXml(xml);
      } catch (error) {
        throw toFriendlyR2Error(error, "读取文件列表");
      }
    },

    get: async (key, options) => {
      try {
        const headers: Record<string, string> = {};
        if (options?.range) {
          const start = Math.max(0, options.range.offset);
          const end = Math.max(start, options.range.offset + options.range.length - 1);
          headers.range = `bytes=${start}-${end}`;
        }

        const res = await signedFetch({
          creds: bucketCreds,
          method: "GET",
          key,
          headers,
          unsignedPayload: true,
        });
        if (res.status === 404) return null;
        if (!res.ok) throw await createHttpError("读取文件", res);

        const size = Number(res.headers.get("content-length") ?? NaN);
        const contentType = res.headers.get("content-type") ?? undefined;
        const etag = stripEtag(res.headers.get("etag"));

        return {
          body: (res.body as BodyInit | null) ?? null,
          size: Number.isFinite(size) ? size : undefined,
          etag,
          httpEtag: etag,
          httpMetadata: contentType ? { contentType } : undefined,
          customMetadata: parseMetadataFromHeaders(res.headers),
        };
      } catch (error) {
        if (readErrorStatus(error) === 404) return null;
        throw toFriendlyR2Error(error, "读取文件");
      }
    },

    head: async (key) => {
      try {
        const res = await signedFetch({
          creds: bucketCreds,
          method: "HEAD",
          key,
          unsignedPayload: true,
        });
        if (res.status === 404) return null;
        if (!res.ok) throw await createHttpError("读取文件信息", res);

        const size = Number(res.headers.get("content-length") ?? NaN);
        return {
          size: Number.isFinite(size) ? size : undefined,
          etag: stripEtag(res.headers.get("etag")),
        };
      } catch (error) {
        if (readErrorStatus(error) === 404) return null;
        throw toFriendlyR2Error(error, "读取文件信息");
      }
    },

    put: async (key, value, options) => {
      const opt = (options ?? {}) as {
        httpMetadata?: { contentType?: string };
        customMetadata?: unknown;
      };
      const metadata = normalizeMetadata(opt.customMetadata);

      try {
        const body = await asBodyInit(value);
        const headers: Record<string, string> = {};
        if (opt.httpMetadata?.contentType) headers["content-type"] = opt.httpMetadata.contentType;
        for (const [k, v] of Object.entries(metadata ?? {})) {
          headers[`x-amz-meta-${k}`] = v;
        }

        const res = await signedFetch({
          creds: bucketCreds,
          method: "PUT",
          key,
          headers,
          body,
          unsignedPayload: true,
        });
        if (!res.ok) throw await createHttpError("上传文件", res);
        return { etag: stripEtag(res.headers.get("etag")) };
      } catch (error) {
        throw toFriendlyR2Error(error, "上传文件");
      }
    },

    delete: async (keyOrKeys) => {
      try {
        const keys = typeof keyOrKeys === "string" ? [keyOrKeys] : keyOrKeys.filter((k) => typeof k === "string" && k.length > 0);
        for (const key of keys) {
          const res = await signedFetch({
            creds: bucketCreds,
            method: "DELETE",
            key,
            unsignedPayload: true,
          });
          if (res.status === 404) continue;
          if (!res.ok) throw await createHttpError("删除文件", res);
        }
      } catch (error) {
        throw toFriendlyR2Error(error, "删除文件");
      }
    },

    createMultipartUpload: async (key, options) => {
      const opt = (options ?? {}) as {
        httpMetadata?: { contentType?: string };
        customMetadata?: unknown;
      };
      const metadata = normalizeMetadata(opt.customMetadata);

      try {
        const headers: Record<string, string> = {};
        if (opt.httpMetadata?.contentType) headers["content-type"] = opt.httpMetadata.contentType;
        for (const [k, v] of Object.entries(metadata ?? {})) {
          headers[`x-amz-meta-${k}`] = v;
        }

        const res = await signedFetch({
          creds: bucketCreds,
          method: "POST",
          key,
          query: { uploads: "" },
          headers,
          unsignedPayload: true,
        });
        if (!res.ok) throw await createHttpError("创建分片上传", res);
        const xml = await res.text();
        const uploadId = parseXmlTag(xml, "UploadId");
        if (!uploadId) throw new Error("创建分片上传失败");
        return { uploadId };
      } catch (error) {
        throw toFriendlyR2Error(error, "创建分片上传");
      }
    },

    resumeMultipartUpload: (key, uploadId) => ({
      uploadPart: async (partNumber, body) => {
        try {
          const res = await signedFetch({
            creds: bucketCreds,
            method: "PUT",
            key,
            query: {
              partNumber,
              uploadId,
            },
            body: await asBodyInit(body),
            unsignedPayload: true,
          });
          if (!res.ok) throw await createHttpError("上传分片", res);
          return { etag: stripEtag(res.headers.get("etag")) };
        } catch (error) {
          throw toFriendlyR2Error(error, "上传分片");
        }
      },

      complete: async (parts) => {
        const normalizedParts = parts
          .filter((p) => p.etag && Number.isFinite(p.partNumber) && p.partNumber > 0)
          .sort((a, b) => a.partNumber - b.partNumber);

        const xml = `<CompleteMultipartUpload>${normalizedParts
          .map((p) => `<Part><ETag>\"${escapeXml(stripEtag(p.etag))}\"</ETag><PartNumber>${p.partNumber}</PartNumber></Part>`)
          .join("")}</CompleteMultipartUpload>`;

        try {
          const res = await signedFetch({
            creds: bucketCreds,
            method: "POST",
            key,
            query: { uploadId },
            headers: { "content-type": "application/xml" },
            body: xml,
            unsignedPayload: false,
          });
          if (!res.ok) throw await createHttpError("完成分片上传", res);
        } catch (error) {
          throw toFriendlyR2Error(error, "完成分片上传");
        }
      },

      abort: async () => {
        try {
          const res = await signedFetch({
            creds: bucketCreds,
            method: "DELETE",
            key,
            query: { uploadId },
            unsignedPayload: true,
          });
          if (res.status === 404) return;
          if (!res.ok) throw await createHttpError("取消分片上传", res);
        } catch (error) {
          throw toFriendlyR2Error(error, "取消分片上传");
        }
      },
    }),
  };
};

export const copyObjectInBucket = async (creds: R2ClientCredentials, sourceKey: string, targetKey: string) => {
  try {
    const srcBucket = encodeRfc3986(creds.bucketName);
    const srcKey = normalizeObjectKey(sourceKey)
      .split("/")
      .map((p) => encodeRfc3986(p))
      .join("/");

    const res = await signedFetch({
      creds,
      method: "PUT",
      key: targetKey,
      headers: {
        "x-amz-copy-source": `/${srcBucket}/${srcKey}`,
        "x-amz-metadata-directive": "COPY",
      },
      unsignedPayload: true,
    });
    if (!res.ok) throw await createHttpError("复制文件", res);
  } catch (error) {
    throw toFriendlyR2Error(error, "复制文件");
  }
};
