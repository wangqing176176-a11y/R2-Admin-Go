import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, listProfilesByUserIds, listTeamMembersByTeamId, requirePermission } from "@/lib/access-control";
import { clearFolderUnlockCookie, grantFolderUnlock, readFolderUnlockGrants } from "@/lib/folder-lock-access";
import { FOLDER_ROUTE_SESSION_COOKIE } from "@/lib/folder-route-access";
import {
  deleteFolderLock,
  getExactFolderLock,
  normalizeFolderLockPrefix,
  toFolderLockView,
  upsertFolderLock,
  verifyFolderLockPasscode,
  assertFolderLockManager,
  assertFolderAccessDecision,
  createFolderAccessReader,
  type UpsertFolderLockInput,
} from "@/lib/folder-locks";
import { evaluateFolderAccess, hasFolderIdentityAccess } from "@/lib/folder-access-policy";
import { resolveBucketCredentials } from "@/lib/user-buckets";
import { supabaseAdminRestFetch } from "@/lib/supabase";
import { toChineseErrorMessage } from "@/lib/error-zh";
import { writeAuditLog } from "@/lib/audit-logs";

export const runtime = "edge";

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearFolderUnlockCookie(res);
  res.cookies.set(FOLDER_ROUTE_SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return res;
}

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown, fallback: string) => {
  const message = String((error as Error)?.message ?? "");
  if (/access_policy|folder_unlock_attempt|consume_folder_unlock/i.test(message)) return "请先执行 supabase/folder_access_policies.sql 升级数据库";
  return toChineseErrorMessage(error, fallback);
};

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "object.list", "你没有浏览文件的权限");

    const { searchParams } = new URL(req.url);
    const bucketId = String(searchParams.get("bucket") ?? "").trim();
    const prefixRaw = String(searchParams.get("prefix") ?? "");
    if (!bucketId || !prefixRaw) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });
    await resolveBucketCredentials(ctx, bucketId);
    const prefix = normalizeFolderLockPrefix(prefixRaw);
    if (searchParams.get("manage") === "1") {
      assertFolderLockManager(ctx);
      const [row, members] = await Promise.all([getExactFolderLock(ctx, bucketId, prefix), listTeamMembersByTeamId(ctx.team.id)]);
      const profiles = await listProfilesByUserIds(members.map((member) => member.user_id));
      return NextResponse.json({
        lock: row ? toFolderLockView(row) : null,
        members: members.map((member) => ({ userId: member.user_id, role: member.role, status: member.status,
          displayName: profiles.find((profile) => profile.user_id === member.user_id)?.display_name || "未命名成员" })),
      }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const access = await createFolderAccessReader(req, ctx, bucketId);
    const decision = access.decision(prefix);
    if (decision === "deny_hidden" || decision === "deny_visible") assertFolderAccessDecision(decision, access.lockFor(prefix));
    const row = access.lockFor(prefix);
    return NextResponse.json({ lock: row ? { bucketId, prefix: row.prefix, hint: row.hint } : null, access: decision, unlocked: decision === "allow" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "读取加密文件夹状态失败") }, { status: toStatus(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "object.list", "你没有浏览文件的权限");

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      bucketId?: string;
      bucket?: string;
      prefix?: string;
      passcode?: string;
      hint?: string;
      policy?: UpsertFolderLockInput["policy"];
    };

    const action = String(body.action ?? "").trim();
    const bucketId = String(body.bucketId ?? body.bucket ?? "").trim();
    const prefix = String(body.prefix ?? "");

    if (!bucketId || !prefix) {
      return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });
    }
    await resolveBucketCredentials(ctx, bucketId);

    if (action === "unlock") {
      const normalizedPrefix = normalizeFolderLockPrefix(prefix);
      const row = await getExactFolderLock(ctx, bucketId, normalizedPrefix);
      if (!row?.id || !row.enabled) {
        return NextResponse.json({ error: "文件或文件夹不存在" }, { status: 404 });
      }
      if (!hasFolderIdentityAccess(ctx, row)) assertFolderAccessDecision(evaluateFolderAccess(ctx, row), row);
      const decision = evaluateFolderAccess(ctx, row, await readFolderUnlockGrants(req));
      if (decision === "allow") return NextResponse.json({ ok: true });
      const limitRes = await supabaseAdminRestFetch("rpc/consume_folder_unlock_attempt", {
        method: "POST", body: { p_policy_id: row.id, p_user_id: ctx.user.id },
      });
      if (!limitRes.ok) throw new Error("consume_folder_unlock_attempt unavailable");
      const limit = await limitRes.json() as { allowed: boolean; retryAfter: number };
      if (!limit.allowed) return NextResponse.json({ error: "尝试次数过多，请稍后重试" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter || 300) } });
      const ok = await verifyFolderLockPasscode(row, String(body.passcode ?? ""));
      if (!ok) {
        return NextResponse.json({ error: "密码错误，请重试" }, { status: 400 });
      }
      const res = NextResponse.json({ ok: true });
      await grantFolderUnlock(req, res, ctx, row);
      return res;
    }

    if (action === "upsert") {
      assertFolderLockManager(ctx);
      const existed = await getExactFolderLock(ctx, bucketId, prefix);
      const lock = await upsertFolderLock(ctx, {
        bucketId,
        prefix,
        passcode: String(body.passcode ?? ""),
        hint: String(body.hint ?? ""),
        policy: body.policy,
      });
      await writeAuditLog(ctx, {
        bucketId,
        action: existed?.id ? "folder_lock_update" : "folder_lock_enable",
        itemType: "folder",
        itemKey: lock.prefix,
        itemName: lock.prefix.split("/").filter(Boolean).pop() || lock.prefix,
        summary: `${ctx.displayName} ${existed?.id ? "更新" : "启用"}文件夹加密「${lock.prefix}」`,
      });
      return NextResponse.json({ ok: true, lock });
    }

    if (action === "delete") {
      const removed = await deleteFolderLock(ctx, bucketId, prefix);
      await writeAuditLog(ctx, {
        bucketId,
        action: "folder_lock_disable",
        itemType: "folder",
        itemKey: prefix,
        itemName: prefix.split("/").filter(Boolean).pop() || prefix,
        summary: `${ctx.displayName} 取消文件夹加密「${prefix}」`,
      });
      return NextResponse.json({ ok: true, lock: removed });
    }

    return NextResponse.json({ error: "无效操作" }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "加密文件夹操作失败") }, { status: toStatus(error) });
  }
}
