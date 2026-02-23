import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, requirePermission } from "@/lib/access-control";
import { grantFolderUnlock, hasFolderUnlockGrant } from "@/lib/folder-lock-access";
import {
  deleteFolderLock,
  getExactFolderLock,
  normalizeFolderLockPrefix,
  toFolderLockView,
  upsertFolderLock,
  verifyFolderLockPasscode,
} from "@/lib/folder-locks";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown, fallback: string) => toChineseErrorMessage(error, fallback);

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "object.list", "你没有浏览文件的权限");

    const { searchParams } = new URL(req.url);
    const bucketId = String(searchParams.get("bucket") ?? "").trim();
    const prefixRaw = String(searchParams.get("prefix") ?? "").trim();
    if (!bucketId || !prefixRaw) return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });

    const prefix = normalizeFolderLockPrefix(prefixRaw);
    const row = await getExactFolderLock(ctx, bucketId, prefix);
    const unlocked = row ? await hasFolderUnlockGrant(req, bucketId, prefix) : false;
    return NextResponse.json({ lock: row ? toFolderLockView(row) : null, unlocked });
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
    };

    const action = String(body.action ?? "").trim();
    const bucketId = String(body.bucketId ?? body.bucket ?? "").trim();
    const prefix = String(body.prefix ?? "").trim();

    if (!bucketId || !prefix) {
      return NextResponse.json({ error: "请求参数不完整" }, { status: 400 });
    }

    if (action === "unlock") {
      const normalizedPrefix = normalizeFolderLockPrefix(prefix);
      const row = await getExactFolderLock(ctx, bucketId, normalizedPrefix);
      if (!row?.id || !row.enabled) {
        return NextResponse.json({ error: "该文件夹未启用加密" }, { status: 404 });
      }
      const ok = await verifyFolderLockPasscode(row, String(body.passcode ?? ""));
      if (!ok) {
        return NextResponse.json({ error: "密码错误，请重试" }, { status: 400 });
      }
      const res = NextResponse.json({ ok: true, lock: toFolderLockView(row) });
      await grantFolderUnlock(req, res, bucketId, normalizedPrefix);
      return res;
    }

    if (action === "upsert") {
      const lock = await upsertFolderLock(ctx, {
        bucketId,
        prefix,
        passcode: String(body.passcode ?? ""),
        hint: String(body.hint ?? ""),
      });
      return NextResponse.json({ ok: true, lock });
    }

    if (action === "delete") {
      const removed = await deleteFolderLock(ctx, bucketId, prefix);
      return NextResponse.json({ ok: true, lock: removed });
    }

    return NextResponse.json({ error: "无效操作" }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "加密文件夹操作失败") }, { status: toStatus(error) });
  }
}

