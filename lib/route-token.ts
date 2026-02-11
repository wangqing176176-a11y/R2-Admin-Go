import { issueSealedPayload, readSealedPayload } from "@/lib/crypto";

export type RouteTokenCredentials = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

export type PutRouteToken = {
  op: "put";
  creds: RouteTokenCredentials;
  key: string;
};

export type MultipartRouteToken = {
  op: "mp";
  creds: RouteTokenCredentials;
  key: string;
  uploadId: string;
  partNumber: number;
};

export type ObjectRouteToken = {
  op: "object";
  creds: RouteTokenCredentials;
  key: string;
  download: boolean;
};

export type RouteTokenPayload = PutRouteToken | MultipartRouteToken | ObjectRouteToken;

export const issueRouteToken = async (payload: RouteTokenPayload, expiresInSeconds = 900) => {
  return await issueSealedPayload(payload, expiresInSeconds);
};

export const readRouteToken = async <T extends RouteTokenPayload>(token: string, expectedOp: T["op"]): Promise<T> => {
  const payload = await readSealedPayload<RouteTokenPayload>(token);
  if (!payload || payload.op !== expectedOp) throw new Error("操作令牌无效，请重试。");
  return payload as T;
};
