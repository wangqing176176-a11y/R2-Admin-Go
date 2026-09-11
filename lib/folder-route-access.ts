import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, requirePermission, type AppAccessContext, type PermissionKey } from "@/lib/access-control";
import { issueSealedPayload, readSealedPayload } from "@/lib/crypto";
import { assertFolderUnlockedForPath } from "@/lib/folder-locks";

export const FOLDER_ROUTE_SESSION_COOKIE = "r2_folder_session_v1";
export type FolderRouteAccess = { userId: string; teamId: string; bucketId: string };
export const folderRouteAccessFor = (ctx: AppAccessContext, bucketId: string): FolderRouteAccess => ({ userId: ctx.user.id, teamId: ctx.team.id, bucketId });

export const setFolderRouteSession = async (res: NextResponse, ctx: AppAccessContext) => {
  const token = await issueSealedPayload({ accessToken: ctx.token }, 3600);
  res.cookies.set(FOLDER_ROUTE_SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 3600,
  });
};

// Native image/video requests cannot carry the application's Authorization
// header. Require the same browser session and re-check current permissions.
export const assertFolderRouteAccess = async (req: NextRequest, access: FolderRouteAccess, key: string, permission: PermissionKey) => {
  let bearer = req.headers.get("authorization");
  if (!bearer) {
    const cookie = req.cookies.get(FOLDER_ROUTE_SESSION_COOKIE)?.value;
    if (!cookie) throw Object.assign(new Error("请登录后访问此文件"), { status: 401 });
    const session = await readSealedPayload<{ accessToken: string }>(cookie);
    bearer = "Bearer " + session.accessToken;
  }
  const ctx = await getAppAccessContextFromRequest(new Request(req.url, { headers: { authorization: bearer } }));
  if (ctx.user.id !== access.userId || ctx.team.id !== access.teamId) throw Object.assign(new Error("文件或文件夹不存在"), { status: 404 });
  requirePermission(ctx, permission, "你没有执行此操作的权限");
  await assertFolderUnlockedForPath(req, ctx, access.bucketId, key);
};
