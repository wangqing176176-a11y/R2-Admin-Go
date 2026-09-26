import { requireEnvString } from "@/lib/env";

export type OnlyOfficeProvider = "microsoft" | "onlyoffice";
export type OnlyOfficeMode = "view" | "edit";

export type OnlyOfficeSaveSession = {
  documentKey: string;
  sourceEtag: string;
};

type OnlyOfficeDocumentType = "word" | "cell" | "slide";

export type OnlyOfficePreviewResponse = {
  documentServerUrl: string;
  documentKey: string;
  sourceEtag: string;
  config: Record<string, unknown> & { token: string };
};

const textEncoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const encodeJson = (value: unknown) => toBase64Url(textEncoder.encode(JSON.stringify(value)));

const signJwt = async (payload: unknown, secret: string) => {
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const body = encodeJson(payload);
  const input = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(input));
  return `${input}.${toBase64Url(new Uint8Array(signature))}`;
};

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const createOnlyOfficeDocumentKey = async (stableKey: string) => await sha256Hex(stableKey);

const fileInfo = (fileName: string): { fileType: string; documentType: OnlyOfficeDocumentType } => {
  const cleanName = String(fileName ?? "").split(/[?#]/, 1)[0];
  const fileType = cleanName.includes(".") ? cleanName.slice(cleanName.lastIndexOf(".") + 1).toLowerCase() : "";
  if (/^(doc|docx)$/.test(fileType)) return { fileType, documentType: "word" };
  if (/^(xls|xlsx)$/.test(fileType)) return { fileType, documentType: "cell" };
  if (/^(ppt|pptx)$/.test(fileType)) return { fileType, documentType: "slide" };
  throw Object.assign(new Error("ONLYOFFICE 暂不支持预览此文件格式"), { status: 400 });
};

export const getOnlyOfficeContentType = (fileName: string) => {
  const { fileType } = fileInfo(fileName);
  if (fileType === "doc") return "application/msword";
  if (fileType === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (fileType === "xls") return "application/vnd.ms-excel";
  if (fileType === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (fileType === "ppt") return "application/vnd.ms-powerpoint";
  return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
};

export const getOnlyOfficeDocumentServerUrl = () => {
  const raw = requireEnvString("ONLYOFFICE_DOCUMENT_SERVER_URL").replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("ONLYOFFICE_DOCUMENT_SERVER_URL 配置无效");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("ONLYOFFICE_DOCUMENT_SERVER_URL 必须使用 HTTP 或 HTTPS");
  }
  return raw;
};

export const requestOnlyOfficeForceSave = async (documentKey: string) => {
  const key = String(documentKey ?? "").trim();
  if (!key) throw new Error("ONLYOFFICE 文档会话无效");

  const command = { c: "forcesave", key };
  const token = await signJwt(command, requireEnvString("ONLYOFFICE_JWT_SECRET"));
  const response = await fetch(`${getOnlyOfficeDocumentServerUrl()}/coauthoring/CommandService.ashx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...command, token }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ONLYOFFICE 强制保存请求失败（${response.status}）`);

  const result = (await response.json().catch(() => ({}))) as { error?: unknown };
  const errorCode = Number(result.error ?? NaN);
  if (errorCode === 0) return { accepted: true, noChanges: false };
  if (errorCode === 4) return { accepted: true, noChanges: true };

  const messages: Record<number, string> = {
    1: "ONLYOFFICE 未找到当前编辑会话",
    2: "ONLYOFFICE 保存回调地址无效",
    3: "ONLYOFFICE 文档服务内部错误",
    5: "ONLYOFFICE 不支持当前保存命令",
    6: "ONLYOFFICE 保存令牌校验失败",
  };
  throw new Error(messages[errorCode] ?? `ONLYOFFICE 强制保存失败（错误码 ${String(result.error ?? "未知")}）`);
};

export const buildOnlyOfficePreviewResponse = async (input: {
  sourceUrl: string;
  fileName: string;
  stableKey: string;
  userId: string;
  userName: string;
  mode?: OnlyOfficeMode;
  callbackUrl?: string;
  sourceEtag?: string;
}): Promise<OnlyOfficePreviewResponse> => {
  const source = new URL(input.sourceUrl);
  if (source.protocol !== "https:" && source.protocol !== "http:") {
    throw Object.assign(new Error("文件预览地址无效"), { status: 400 });
  }

  const { fileType, documentType } = fileInfo(input.fileName);
  const secret = requireEnvString("ONLYOFFICE_JWT_SECRET");
  const title = String(input.fileName || `preview.${fileType}`).slice(0, 180);
  const mode: OnlyOfficeMode = input.mode === "edit" ? "edit" : "view";
  const canEdit = mode === "edit";
  const documentKey = await createOnlyOfficeDocumentKey(input.stableKey);
  const config: Record<string, unknown> = {
    documentType,
    type: "desktop",
    width: "100%",
    height: "100%",
    document: {
      fileType,
      key: documentKey,
      title,
      url: source.toString(),
      permissions: {
        chat: false,
        comment: false,
        copy: true,
        download: true,
        edit: canEdit,
        fillForms: false,
        print: true,
        review: false,
      },
    },
    editorConfig: {
      lang: "zh-CN",
      mode,
      ...(canEdit && input.callbackUrl ? { callbackUrl: input.callbackUrl } : {}),
      user: {
        id: String(input.userId || "viewer").slice(0, 128),
        name: String(input.userName || "访客").slice(0, 128),
      },
      customization: {
        chat: false,
        comments: false,
        help: false,
        plugins: false,
        forcesave: canEdit,
      },
    },
  };

  return {
    documentServerUrl: getOnlyOfficeDocumentServerUrl(),
    documentKey,
    sourceEtag: String(input.sourceEtag ?? ""),
    config: { ...config, token: await signJwt(config, secret) },
  };
};
