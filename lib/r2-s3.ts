import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

type AwsLikeError = {
  name?: string;
  code?: string;
  Code?: string;
  message?: string;
  $metadata?: { httpStatusCode?: number };
};

export const createS3Client = (creds: R2ClientCredentials) => {
  return new S3Client({
    region: "auto",
    endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    },
  });
};

const stripEtag = (etag?: string | null) => {
  const v = String(etag ?? "").trim();
  return v.replace(/^\"|\"$/g, "");
};

const isNotFoundError = (err: unknown) => {
  const code = Number((err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode ?? NaN);
  const name = String((err as { name?: string })?.name ?? "");
  return code === 404 || name === "NoSuchKey" || name === "NotFound";
};

const readErrorStatus = (error: unknown) => {
  const status = Number((error as AwsLikeError)?.$metadata?.httpStatusCode ?? NaN);
  return Number.isFinite(status) ? status : undefined;
};

const readErrorName = (error: unknown) => {
  const e = error as AwsLikeError;
  return String(e?.name ?? e?.Code ?? e?.code ?? "").trim();
};

const readErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error ?? "");

const toFriendlyR2Message = (error: unknown, action: string) => {
  const name = readErrorName(error);
  const status = readErrorStatus(error);
  const message = readErrorMessage(error);
  const normalized = `${name} ${message}`.toLowerCase();

  if (normalized.includes("domparser is not defined")) {
    return "当前运行环境缺少 XML 解析器（DOMParser），无法读取 R2 返回结果。请使用 Node 22 LTS 并重装依赖后重试。";
  }
  if (normalized.includes("invalidaccesskeyid")) {
    return "Access Key ID 填写错误，请检查 Access Key ID。";
  }
  if (normalized.includes("signaturedoesnotmatch")) {
    return "签名校验失败：Secret Access Key、Account ID 或桶名可能填写错误。";
  }
  if (normalized.includes("nosuchbucket")) {
    return "桶名错误：该桶不存在，请检查 R2 桶名称。";
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
  const e = new Error(toFriendlyR2Message(error, action)) as Error & { status?: number; cause?: unknown };
  const status = readErrorStatus(error);
  if (status) e.status = status;
  e.cause = error;
  return e;
};

const isDomParserMissingError = (error: unknown) => {
  const name = readErrorName(error).toLowerCase();
  const message = readErrorMessage(error).toLowerCase();
  return name.includes("domparser") || message.includes("domparser is not defined");
};

const decodeXmlEntities = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const readFirstTagValue = (xml: string, tag: string): string | undefined => {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m?.[1]) return undefined;
  return decodeXmlEntities(m[1].trim());
};

const readTagValuesByBlocks = (xml: string, blockTag: string, innerTag: string): string[] => {
  const out: string[] = [];
  const blockRe = new RegExp(`<${blockTag}>([\\s\\S]*?)<\\/${blockTag}>`, "gi");
  for (;;) {
    const m = blockRe.exec(xml);
    if (!m?.[1]) break;
    const v = readFirstTagValue(m[1], innerTag);
    if (v) out.push(v);
  }
  return out;
};

const readListObjectsFromXml = (xml: string) => {
  const objects: R2ObjectSummaryLike[] = [];
  const contentRe = /<Contents>([\s\S]*?)<\/Contents>/gi;
  for (;;) {
    const m = contentRe.exec(xml);
    if (!m?.[1]) break;
    const block = m[1];
    const key = readFirstTagValue(block, "Key");
    if (!key) continue;
    const rawSize = readFirstTagValue(block, "Size");
    const rawTime = readFirstTagValue(block, "LastModified");
    const size = Number(rawSize ?? NaN);
    const uploaded = rawTime ? new Date(rawTime).toISOString() : undefined;
    objects.push({
      key,
      size: Number.isFinite(size) ? size : undefined,
      uploaded: uploaded && !Number.isNaN(Date.parse(uploaded)) ? uploaded : undefined,
    });
  }
  return objects;
};

const listViaPresignedFetch = async (
  s3: S3Client,
  input: { Bucket: string; Prefix?: string; Delimiter?: string; ContinuationToken?: string; MaxKeys?: number },
): Promise<R2ListResultLike> => {
  const cmd = new ListObjectsV2Command(input);
  const url = await getSignedUrl(s3, cmd, { expiresIn: 60 });
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    const code = readFirstTagValue(text, "Code");
    const message = readFirstTagValue(text, "Message");
    throw new Error(`ListObjectsV2 failed (${res.status})${code ? `: ${code}` : ""}${message ? ` - ${message}` : ""}`);
  }

  const isTruncated = /^true$/i.test(readFirstTagValue(text, "IsTruncated") ?? "");
  const nextToken = readFirstTagValue(text, "NextContinuationToken");
  const delimitedPrefixes = readTagValuesByBlocks(text, "CommonPrefixes", "Prefix");
  const objects = readListObjectsFromXml(text);

  return {
    objects,
    delimitedPrefixes,
    truncated: isTruncated,
    cursor: nextToken || undefined,
  };
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
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };

  if (typeof maybe.transformToWebStream === "function") {
    return maybe.transformToWebStream();
  }

  if (typeof maybe.arrayBuffer === "function") {
    const buf = await maybe.arrayBuffer();
    return new Uint8Array(buf);
  }

  return body as BodyInit;
};

export const createR2Bucket = (creds: R2ClientCredentials): R2BucketLike => {
  const s3 = createS3Client(creds);
  const Bucket = creds.bucketName;

  return {
    list: async ({ prefix, delimiter, cursor, limit }) => {
      try {
        const res = await s3.send(
          new ListObjectsV2Command({
            Bucket,
            Prefix: prefix || undefined,
            Delimiter: delimiter || undefined,
            ContinuationToken: cursor || undefined,
            MaxKeys: limit ?? 1000,
          }),
        );

        return {
          objects: (res.Contents ?? []).map((o) => ({
            key: String(o.Key ?? ""),
            size: typeof o.Size === "number" ? o.Size : undefined,
            uploaded: o.LastModified ? o.LastModified.toISOString() : undefined,
          })),
          delimitedPrefixes: (res.CommonPrefixes ?? [])
            .map((p) => String(p.Prefix ?? ""))
            .filter(Boolean),
          truncated: Boolean(res.IsTruncated),
          cursor: res.NextContinuationToken || undefined,
        };
      } catch (error) {
        if (isDomParserMissingError(error)) {
          try {
            return await listViaPresignedFetch(s3, {
              Bucket,
              Prefix: prefix || undefined,
              Delimiter: delimiter || undefined,
              ContinuationToken: cursor || undefined,
              MaxKeys: limit ?? 1000,
            });
          } catch (fallbackError) {
            throw toFriendlyR2Error(fallbackError, "读取文件列表");
          }
        }
        throw toFriendlyR2Error(error, "读取文件列表");
      }
    },

    get: async (key, options) => {
      try {
        const range = options?.range
          ? `bytes=${Math.max(0, options.range.offset)}-${Math.max(0, options.range.offset + options.range.length - 1)}`
          : undefined;
        const res = await s3.send(
          new GetObjectCommand({
            Bucket,
            Key: key,
            Range: range,
          }),
        );

        return {
          body: await asBodyInit(res.Body),
          size: typeof res.ContentLength === "number" ? res.ContentLength : undefined,
          etag: stripEtag(res.ETag),
          httpEtag: stripEtag(res.ETag),
          httpMetadata: res.ContentType ? { contentType: res.ContentType } : undefined,
          customMetadata: res.Metadata,
        };
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw toFriendlyR2Error(error, "读取文件");
      }
    },

    head: async (key) => {
      try {
        const res = await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
        return {
          size: typeof res.ContentLength === "number" ? res.ContentLength : undefined,
          etag: stripEtag(res.ETag),
        };
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw toFriendlyR2Error(error, "读取文件信息");
      }
    },

    put: async (key, value, options) => {
      const opt = (options ?? {}) as {
        httpMetadata?: { contentType?: string };
        customMetadata?: unknown;
      };
      try {
        const res = await s3.send(
          new PutObjectCommand({
            Bucket,
            Key: key,
            Body: value as Uint8Array | ReadableStream | Blob | string,
            ContentType: opt.httpMetadata?.contentType,
            Metadata: normalizeMetadata(opt.customMetadata),
          }),
        );
        return { etag: stripEtag(res.ETag) };
      } catch (error) {
        throw toFriendlyR2Error(error, "上传文件");
      }
    },

    delete: async (keyOrKeys) => {
      try {
        if (typeof keyOrKeys === "string") {
          await s3.send(new DeleteObjectCommand({ Bucket, Key: keyOrKeys }));
          return;
        }

        const keys = keyOrKeys.filter((k) => typeof k === "string" && k.length > 0);
        if (!keys.length) return;

        for (let i = 0; i < keys.length; i += 1000) {
          const chunk = keys.slice(i, i + 1000);
          await s3.send(
            new DeleteObjectsCommand({
              Bucket,
              Delete: { Objects: chunk.map((k) => ({ Key: k })), Quiet: true },
            }),
          );
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
      try {
        const res = await s3.send(
          new CreateMultipartUploadCommand({
            Bucket,
            Key: key,
            ContentType: opt.httpMetadata?.contentType,
            Metadata: normalizeMetadata(opt.customMetadata),
          }),
        );
        if (!res.UploadId) throw new Error("创建分片上传失败");
        return { uploadId: res.UploadId };
      } catch (error) {
        throw toFriendlyR2Error(error, "创建分片上传");
      }
    },

    resumeMultipartUpload: (key, uploadId) => ({
      uploadPart: async (partNumber, body) => {
        try {
          const res = await s3.send(
            new UploadPartCommand({
              Bucket,
              Key: key,
              UploadId: uploadId,
              PartNumber: partNumber,
              Body: body as Uint8Array | ReadableStream | Blob | string,
            }),
          );
          return { etag: stripEtag(res.ETag) };
        } catch (error) {
          throw toFriendlyR2Error(error, "上传分片");
        }
      },

      complete: async (parts) => {
        try {
          await s3.send(
            new CompleteMultipartUploadCommand({
              Bucket,
              Key: key,
              UploadId: uploadId,
              MultipartUpload: {
                Parts: parts
                  .filter((p) => p.etag && Number.isFinite(p.partNumber) && p.partNumber > 0)
                  .sort((a, b) => a.partNumber - b.partNumber)
                  .map((p) => ({ ETag: p.etag, PartNumber: p.partNumber })),
              },
            }),
          );
        } catch (error) {
          throw toFriendlyR2Error(error, "完成分片上传");
        }
      },

      abort: async () => {
        try {
          await s3.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId }));
        } catch (error) {
          throw toFriendlyR2Error(error, "取消分片上传");
        }
      },
    }),
  };
};

export const copyObjectInBucket = async (creds: R2ClientCredentials, sourceKey: string, targetKey: string) => {
  const s3 = createS3Client(creds);
  try {
    await s3.send(
      new CopyObjectCommand({
        Bucket: creds.bucketName,
        Key: targetKey,
        CopySource: `${encodeURIComponent(creds.bucketName)}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`,
        MetadataDirective: "COPY",
      }),
    );
  } catch (error) {
    throw toFriendlyR2Error(error, "复制文件");
  }
};
