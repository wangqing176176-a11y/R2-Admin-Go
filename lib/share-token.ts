import { issueSealedPayload, readSealedPayload } from "@/lib/crypto";

export type ShareAccessTokenPayload = {
  op: "share_access";
  shareId: string;
  shareCode: string;
};

export const issueShareAccessToken = async (payload: Omit<ShareAccessTokenPayload, "op">, expiresInSeconds = 12 * 3600) => {
  return await issueSealedPayload(
    {
      op: "share_access",
      shareId: payload.shareId,
      shareCode: payload.shareCode,
    } satisfies ShareAccessTokenPayload,
    expiresInSeconds,
  );
};

export const readShareAccessToken = async (token: string, shareId: string, shareCode: string) => {
  const payload = await readSealedPayload<ShareAccessTokenPayload>(token);
  if (!payload || payload.op !== "share_access" || payload.shareId !== shareId || payload.shareCode !== shareCode) {
    throw new Error("分享访问令牌无效，请重新输入提取码。");
  }
  return payload;
};
