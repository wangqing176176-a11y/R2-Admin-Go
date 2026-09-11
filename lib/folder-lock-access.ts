import { NextRequest, NextResponse } from "next/server";
import { issueSealedPayload, readSealedPayload } from "@/lib/crypto";
import { getFolderAccessPolicy, hasValidFolderGrant, type FolderAccessSubject, type FolderPolicyRecord, type FolderUnlockGrant } from "@/lib/folder-access-policy";

export type { FolderUnlockGrant } from "@/lib/folder-access-policy";
export const FOLDER_UNLOCK_COOKIE_NAME = "r2_folder_unlock_v2";
export const FOLDER_UNLOCK_TTL_SECONDS = 30 * 60;
export type FolderLockErrorMeta = { bucketId: string; prefix: string; hint?: string };

const normalizeGrants = (raw: unknown): FolderUnlockGrant[] => {
  if (!Array.isArray(raw)) return [];
  const grants = new Map<string, FolderUnlockGrant>();
  for (const grant of raw) {
    if (!grant || typeof grant !== "object") continue;
    if (!["userId", "teamId", "bucketId", "policyId", "policyVersion", "prefix"].every((field) => typeof grant[field] === "string" && grant[field])) continue;
    if (!Number.isFinite(grant.expiresAt) || grant.expiresAt <= Date.now()) continue;
    grants.set(grant.userId + ":" + grant.teamId + ":" + grant.policyId, grant as FolderUnlockGrant);
  }
  return [...grants.values()].slice(-6);
};

export const readFolderUnlockGrants = async (req: NextRequest): Promise<FolderUnlockGrant[]> => {
  const token = req.cookies.get(FOLDER_UNLOCK_COOKIE_NAME)?.value;
  if (!token) return [];
  try {
    const payload = await readSealedPayload<{ grants?: unknown }>(token);
    return normalizeGrants(payload?.grants);
  } catch {
    return [];
  }
};

export const hasFolderUnlockGrant = async (req: NextRequest, ctx: FolderAccessSubject, row: FolderPolicyRecord) =>
  hasValidFolderGrant(ctx, row, await readFolderUnlockGrants(req));

export const setFolderUnlockGrantsCookie = async (res: NextResponse, grants: FolderUnlockGrant[]) => {
  let kept = normalizeGrants(grants);
  let token = await issueSealedPayload({ grants: kept }, FOLDER_UNLOCK_TTL_SECONDS);
  // Leave room for cookie attributes under the browser's 4 KB limit.
  while (token.length > 3600 && kept.length) {
    kept = kept.slice(1);
    token = await issueSealedPayload({ grants: kept }, FOLDER_UNLOCK_TTL_SECONDS);
  }
  res.cookies.set(FOLDER_UNLOCK_COOKIE_NAME, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: FOLDER_UNLOCK_TTL_SECONDS,
  });
};

export const grantFolderUnlock = async (req: NextRequest, res: NextResponse, ctx: FolderAccessSubject, row: FolderPolicyRecord) => {
  const existing = (await readFolderUnlockGrants(req)).filter((g) => g.userId === ctx.user.id && g.teamId === ctx.team.id && g.policyId !== row.id);
  await setFolderUnlockGrantsCookie(res, [...existing, {
    userId: ctx.user.id, teamId: ctx.team.id, bucketId: row.bucket_id, policyId: row.id,
    policyVersion: getFolderAccessPolicy(row).version, prefix: row.prefix, expiresAt: Date.now() + FOLDER_UNLOCK_TTL_SECONDS * 1000,
  }]);
};

export const clearFolderUnlockCookie = (res: NextResponse) => {
  for (const name of [FOLDER_UNLOCK_COOKIE_NAME, "r2_folder_unlock_v1"]) {
    res.cookies.set(name, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  }
};

export const createFolderLockedError = (meta: FolderLockErrorMeta, message = "请输入文件夹访问密码") =>
  Object.assign(new Error(message), { status: 423, folderLock: meta });
