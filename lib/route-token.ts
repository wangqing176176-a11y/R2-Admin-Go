import { issueSealedPayload, readSealedPayload } from "@/lib/crypto";
import type { FolderRouteAccess } from "@/lib/folder-route-access";

export type RouteTokenCredentials = {
  provider?: "cloudflare_r2" | "aws_s3" | "custom_s3" | "webdav" | "onedrive" | "google_drive" | "dropbox";
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint?: string;
  region?: string;
  pathStyle?: boolean;
  rootPath?: string;
  username?: string;
  password?: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  driveId?: string;
};

export type PutRouteToken = {
  folderAccess?: FolderRouteAccess;
  ifNoneMatch?: string;
  permission?: "object.upload" | "editor.online.save";
  op: "put";
  creds: RouteTokenCredentials;
  key: string;
};

export type MultipartRouteToken = {
  folderAccess?: FolderRouteAccess;
  op: "mp";
  creds: RouteTokenCredentials;
  key: string;
  targetKey?: string;
  uploadId: string;
  partNumber: number;
};

export type ObjectRouteToken = {
  folderAccess?: FolderRouteAccess;
  op: "object";
  creds: RouteTokenCredentials;
  key: string;
  download: boolean;
};

export type OnlyOfficeCallbackRouteToken = {
  op: "onlyoffice-callback";
  creds: RouteTokenCredentials;
  key: string;
  contentType: string;
  documentKey: string;
};

export type RouteTokenPayload = PutRouteToken | MultipartRouteToken | ObjectRouteToken | OnlyOfficeCallbackRouteToken;

export const issueRouteToken = async (payload: RouteTokenPayload, expiresInSeconds = 900) => {
  return await issueSealedPayload(payload, expiresInSeconds);
};

export const readRouteToken = async <T extends RouteTokenPayload>(token: string, expectedOp: T["op"]): Promise<T> => {
  const payload = await readSealedPayload<RouteTokenPayload>(token);
  if (!payload || payload.op !== expectedOp) throw new Error("操作令牌无效，请重试。");
  return payload as T;
};
