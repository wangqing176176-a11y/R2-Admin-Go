import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, requirePermission } from "@/lib/access-control";
import { readSupabaseRestArray, supabaseAdminRestFetch } from "@/lib/supabase";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

type PresenceAction = "read" | "track" | "untrack";

type PresenceRpcRow = {
  editor_user_id: string;
  editor_user_name: string;
  editor_online_at: string;
};

const DOCUMENT_HASH_PATTERN = /^[0-9a-f]{32}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,160}$/;

const createHttpError = (status: number, message: string) => {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
};

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  if (Number.isFinite(status) && status >= 100) return status;
  const message = String((error as { message?: unknown })?.message ?? error ?? "").toLowerCase();
  return /app_(file_editor_presence|sync_file_editor_presence)|pgrst202|pgrst205|42p01/.test(message) ? 503 : 500;
};

const toMessage = (error: unknown) => {
  const message = String((error as { message?: unknown })?.message ?? error ?? "");
  if (/app_(file_editor_presence|sync_file_editor_presence)|pgrst202|pgrst205|42p01/i.test(message)) {
    return "协作兼容服务尚未初始化，请重新执行 supabase/app_realtime_presence.sql";
  }
  return toChineseErrorMessage(error, "读取协作成员失败，请稍后重试。");
};

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "object.read", "你没有读取文件的权限");
    requirePermission(ctx, "preview.online", "你没有在线预览权限");

    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      bucketId?: unknown;
      documentHash?: unknown;
      sessionId?: unknown;
    };
    const action = String(body.action ?? "read") as PresenceAction;
    const bucketId = String(body.bucketId ?? "").trim();
    const documentHash = String(body.documentHash ?? "").trim().toLowerCase();
    const sessionId = String(body.sessionId ?? "").trim();

    if (action !== "read" && action !== "track" && action !== "untrack") {
      throw createHttpError(400, "协作状态操作无效");
    }
    if (!UUID_PATTERN.test(bucketId)) throw createHttpError(400, "存储桶参数无效");
    if (!DOCUMENT_HASH_PATTERN.test(documentHash)) throw createHttpError(400, "文件协作标识无效");
    if (action !== "read" && !SESSION_ID_PATTERN.test(sessionId)) {
      throw createHttpError(400, "协作会话标识无效");
    }
    if (action === "track") {
      requirePermission(ctx, "editor.online.save", "你没有在线编辑保存权限");
    }

    const response = await supabaseAdminRestFetch("rpc/app_sync_file_editor_presence", {
      method: "POST",
      body: {
        target_action: action,
        target_team_id: ctx.team.id,
        target_bucket_id: bucketId,
        target_document_hash: documentHash,
        target_user_id: ctx.user.id,
        target_session_id: action === "read" ? "" : sessionId,
        target_user_name: action === "track" ? (ctx.displayName || "未命名成员").slice(0, 128) : "",
      },
    });
    const rows = await readSupabaseRestArray<PresenceRpcRow>(response, "读取协作成员失败");
    const editors = rows
      .map((row) => ({
        id: String(row.editor_user_id ?? "").trim(),
        name: String(row.editor_user_name ?? "").trim().slice(0, 128),
        onlineAt: String(row.editor_online_at ?? "").trim() || undefined,
      }))
      .filter((editor) => editor.id && editor.name)
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));

    return NextResponse.json(
      { editors, mode: "fallback", serverTime: new Date().toISOString() },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: toMessage(error) },
      { status: toStatus(error), headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
