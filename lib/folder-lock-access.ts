import { NextRequest, NextResponse } from "next/server";
import { issueSealedPayload, readSealedPayload } from "@/lib/crypto";

export const FOLDER_UNLOCK_COOKIE_NAME = "r2_folder_unlock_v1";
export const FOLDER_UNLOCK_TTL_SECONDS = 30 * 60;

export type FolderUnlockGrant = {
  bucketId: string;
  prefix: string;
};

type FolderUnlockPayload = {
  grants: FolderUnlockGrant[];
};

export type FolderLockErrorMeta = {
  bucketId: string;
  prefix: string;
  hint?: string;
};

const isString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

const normalizeGrant = (raw: unknown): FolderUnlockGrant | null => {
  if (!raw || typeof raw !== "object") return null;
  const bucketId = String((raw as { bucketId?: unknown }).bucketId ?? "").trim();
  let prefix = String((raw as { prefix?: unknown }).prefix ?? "").trim();
  while (prefix.startsWith("/")) prefix = prefix.slice(1);
  if (prefix && !prefix.endsWith("/")) prefix += "/";
  if (!bucketId || !prefix) return null;
  return { bucketId, prefix };
};

const dedupeGrants = (grants: FolderUnlockGrant[]) => {
  const sorted = [...grants].sort((a, b) => {
    if (a.bucketId !== b.bucketId) return a.bucketId.localeCompare(b.bucketId);
    return a.prefix.localeCompare(b.prefix);
  });
  const out: FolderUnlockGrant[] = [];
  for (const grant of sorted) {
    const existingParent = out.find((x) => x.bucketId === grant.bucketId && grant.prefix.startsWith(x.prefix));
    if (existingParent) continue;
    for (let i = out.length - 1; i >= 0; i -= 1) {
      const x = out[i];
      if (x.bucketId === grant.bucketId && x.prefix.startsWith(grant.prefix)) out.splice(i, 1);
    }
    out.push(grant);
  }
  return out.slice(0, 64);
};

export const readFolderUnlockGrants = async (req: NextRequest): Promise<FolderUnlockGrant[]> => {
  const token = req.cookies.get(FOLDER_UNLOCK_COOKIE_NAME)?.value ?? "";
  if (!token) return [];
  try {
    const payload = await readSealedPayload<FolderUnlockPayload>(token);
    const grants = Array.isArray(payload?.grants) ? payload.grants.map(normalizeGrant).filter(Boolean) : [];
    return dedupeGrants(grants as FolderUnlockGrant[]);
  } catch {
    return [];
  }
};

export const hasFolderUnlockGrant = async (req: NextRequest, bucketId: string, path: string) => {
  if (!isString(bucketId)) return false;
  const normalizedPath = String(path ?? "").replace(/^\/+/, "");
  if (!normalizedPath) return false;
  const grants = await readFolderUnlockGrants(req);
  return grants.some((g) => g.bucketId === bucketId && normalizedPath.startsWith(g.prefix));
};

export const setFolderUnlockGrantsCookie = async (
  res: NextResponse,
  grants: FolderUnlockGrant[],
  ttlSeconds = FOLDER_UNLOCK_TTL_SECONDS,
) => {
  const token = await issueSealedPayload({ grants: dedupeGrants(grants) }, ttlSeconds);
  res.cookies.set(FOLDER_UNLOCK_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttlSeconds,
  });
};

export const grantFolderUnlock = async (req: NextRequest, res: NextResponse, bucketId: string, prefix: string) => {
  const existing = await readFolderUnlockGrants(req);
  const next = dedupeGrants([...existing, { bucketId, prefix }]);
  await setFolderUnlockGrantsCookie(res, next, FOLDER_UNLOCK_TTL_SECONDS);
};

export const clearFolderUnlockCookie = (res: NextResponse) => {
  res.cookies.set(FOLDER_UNLOCK_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
};

export const createFolderLockedError = (meta: FolderLockErrorMeta, message = "该文件夹已加密，请先解锁") => {
  const err = new Error(message) as Error & { status?: number; folderLock?: FolderLockErrorMeta };
  err.status = 423;
  err.folderLock = meta;
  return err;
};

