import type { AppAccessContext } from "@/lib/access-control";
import { readSupabaseRestArray, supabaseAdminRestFetch } from "@/lib/supabase";

export type AuditLogAction =
  | "upload"
  | "download"
  | "mkdir"
  | "rename"
  | "move"
  | "copy"
  | "move_to_recycle"
  | "restore"
  | "permanent_delete"
  | "clear_recycle"
  | "favorite_add"
  | "favorite_remove"
  | "share_create"
  | "share_stop"
  | "share_update"
  | "share_cleanup"
  | "folder_lock_enable"
  | "folder_lock_update"
  | "folder_lock_disable";

export type AuditLogItemType = "file" | "folder" | "bucket" | "share" | "system";

export type AuditLogRow = {
  id: string;
  team_id: string;
  bucket_id: string | null;
  actor_user_id: string | null;
  actor_name: string;
  actor_email: string;
  actor_role: string;
  action: AuditLogAction;
  item_type: AuditLogItemType;
  item_key: string;
  item_name: string;
  source_key: string | null;
  target_key: string | null;
  summary: string;
  status: "success" | "failed";
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AuditLogView = {
  id: string;
  teamId: string;
  bucketId: string;
  actorUserId: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  action: AuditLogAction;
  actionLabel: string;
  itemType: AuditLogItemType;
  itemTypeLabel: string;
  itemKey: string;
  itemName: string;
  sourceKey: string;
  targetKey: string;
  summary: string;
  status: "success" | "failed";
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AuditLogInput = {
  bucketId?: string | null;
  action: AuditLogAction;
  itemType?: AuditLogItemType;
  itemKey?: string;
  itemName?: string;
  sourceKey?: string | null;
  targetKey?: string | null;
  summary?: string;
  status?: "success" | "failed";
  metadata?: Record<string, unknown>;
};

export type AuditLogListOptions = {
  bucketId?: string;
  action?: string;
  actions?: string[];
  itemType?: string;
  actor?: string;
  actors?: string[];
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
  objectKey?: string;
  limit?: number;
};

const SELECT_COLUMNS =
  "id,team_id,bucket_id,actor_user_id,actor_name,actor_email,actor_role,action,item_type,item_key,item_name,source_key,target_key,summary,status,metadata,created_at";

const encodeFilter = (value: string) => encodeURIComponent(value);

const nameOf = (key: string) => {
  const normalized = key.endsWith("/") ? key.slice(0, -1) : key;
  return normalized.split("/").filter(Boolean).pop() || normalized || "未命名";
};

export const getAuditActionLabel = (action: string) => {
  const map: Record<string, string> = {
    upload: "上传",
    download: "下载",
    mkdir: "新建文件夹",
    rename: "重命名",
    move: "移动",
    copy: "复制",
    move_to_recycle: "移入回收站",
    restore: "取消回收",
    permanent_delete: "彻底删除",
    clear_recycle: "清空回收站",
    favorite_add: "添加收藏",
    favorite_remove: "取消收藏",
    share_create: "创建分享",
    share_stop: "停止分享",
    share_update: "更新分享",
    share_cleanup: "清理分享",
    folder_lock_enable: "启用加密",
    folder_lock_update: "更新加密",
    folder_lock_disable: "取消加密",
  };
  return map[action] ?? action;
};

const getItemTypeLabel = (itemType: string) => {
  if (itemType === "folder") return "文件夹";
  if (itemType === "bucket") return "存储桶";
  if (itemType === "share") return "分享";
  if (itemType === "system") return "系统";
  return "文件";
};

const toView = (row: AuditLogRow): AuditLogView => ({
  id: row.id,
  teamId: row.team_id,
  bucketId: row.bucket_id ?? "",
  actorUserId: row.actor_user_id ?? "",
  actorName: row.actor_name || row.actor_email || row.actor_user_id || "-",
  actorEmail: row.actor_email ?? "",
  actorRole: row.actor_role ?? "",
  action: row.action,
  actionLabel: getAuditActionLabel(row.action),
  itemType: row.item_type,
  itemTypeLabel: getItemTypeLabel(row.item_type),
  itemKey: row.item_key ?? "",
  itemName: row.item_name || nameOf(row.item_key ?? ""),
  sourceKey: row.source_key ?? "",
  targetKey: row.target_key ?? "",
  summary: row.summary ?? "",
  status: row.status,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
});

export const writeAuditLog = async (ctx: AppAccessContext, input: AuditLogInput) => {
  try {
    const itemKey = String(input.itemKey ?? input.sourceKey ?? input.targetKey ?? "").trim();
    const itemType = input.itemType ?? (itemKey.endsWith("/") ? "folder" : "file");
    const summary = input.summary || `${ctx.displayName} ${getAuditActionLabel(input.action)} ${input.itemName || nameOf(itemKey)}`;
    const res = await supabaseAdminRestFetch("user_r2_audit_logs", {
      method: "POST",
      body: {
        team_id: ctx.team.id,
        bucket_id: input.bucketId || null,
        actor_user_id: ctx.user.id,
        actor_name: ctx.displayName,
        actor_email: ctx.user.email ?? "",
        actor_role: ctx.roleLabel,
        action: input.action,
        item_type: itemType,
        item_key: itemKey,
        item_name: input.itemName || nameOf(itemKey),
        source_key: input.sourceKey ?? null,
        target_key: input.targetKey ?? null,
        summary,
        status: input.status ?? "success",
        metadata: input.metadata ?? {},
      },
      prefer: "return=minimal",
    });
    if (!res.ok) console.warn("writeAuditLog failed", await res.text().catch(() => ""));
  } catch (error) {
    console.warn("writeAuditLog failed", error);
  }
};

export const writeAuditLogs = async (ctx: AppAccessContext, inputs: AuditLogInput[]) => {
  if (!inputs.length) return;
  try {
    const body = inputs.map((input) => {
      const itemKey = String(input.itemKey ?? input.sourceKey ?? input.targetKey ?? "").trim();
      const itemType = input.itemType ?? (itemKey.endsWith("/") ? "folder" : "file");
      return {
        team_id: ctx.team.id,
        bucket_id: input.bucketId || null,
        actor_user_id: ctx.user.id,
        actor_name: ctx.displayName,
        actor_email: ctx.user.email ?? "",
        actor_role: ctx.roleLabel,
        action: input.action,
        item_type: itemType,
        item_key: itemKey,
        item_name: input.itemName || nameOf(itemKey),
        source_key: input.sourceKey ?? null,
        target_key: input.targetKey ?? null,
        summary: input.summary || `${ctx.displayName} ${getAuditActionLabel(input.action)} ${input.itemName || nameOf(itemKey)}`,
        status: input.status ?? "success",
        metadata: input.metadata ?? {},
      };
    });
    const res = await supabaseAdminRestFetch("user_r2_audit_logs", {
      method: "POST",
      body,
      prefer: "return=minimal",
    });
    if (!res.ok) console.warn("writeAuditLogs failed", await res.text().catch(() => ""));
  } catch (error) {
    console.warn("writeAuditLogs failed", error);
  }
};

export const listAuditLogs = async (ctx: AppAccessContext, options: AuditLogListOptions = {}) => {
  if (!(ctx.role === "admin" || ctx.role === "super_admin" || ctx.isSuperAdmin) && !options.objectKey) {
    const err = new Error("当前身份没有查看操作记录权限") as Error & { status?: number };
    err.status = 403;
    throw err;
  }

  const limit = Math.min(Math.max(Number(options.limit ?? 200), 1), 500);
  const filters = [
    `team_id=eq.${encodeFilter(ctx.team.id)}`,
    options.bucketId ? `bucket_id=eq.${encodeFilter(options.bucketId)}` : "",
    options.actions?.length
      ? `action=in.(${options.actions.map(encodeFilter).join(",")})`
      : options.action
        ? `action=eq.${encodeFilter(options.action)}`
        : "",
    options.itemType ? `item_type=eq.${encodeFilter(options.itemType)}` : "",
    options.actors?.length
      ? `actor_user_id=in.(${options.actors.map(encodeFilter).join(",")})`
      : options.actor
        ? `actor_user_id=eq.${encodeFilter(options.actor)}`
        : "",
    options.dateFrom ? `created_at=gte.${encodeFilter(options.dateFrom)}` : "",
    options.dateTo ? `created_at=lte.${encodeFilter(options.dateTo)}` : "",
    options.objectKey ? `or=(item_key.eq.${encodeFilter(options.objectKey)},source_key.eq.${encodeFilter(options.objectKey)},target_key.eq.${encodeFilter(options.objectKey)})` : "",
    "order=created_at.desc",
    `limit=${limit}`,
  ].filter(Boolean);

  const rows = await readSupabaseRestArray<AuditLogRow>(
    await supabaseAdminRestFetch(`user_r2_audit_logs?select=${SELECT_COLUMNS}&${filters.join("&")}`, { method: "GET" }),
    "读取操作记录失败",
  );

  const keyword = String(options.keyword ?? "").trim().toLowerCase();
  const views = rows.map(toView);
  if (!keyword) return views;
  return views.filter((row) =>
    [row.actorName, row.actorEmail, row.actionLabel, row.itemName, row.itemKey, row.sourceKey, row.targetKey, row.summary]
      .join(" ")
      .toLowerCase()
      .includes(keyword),
  );
};

export const clearAuditLogs = async (ctx: AppAccessContext, ids: string[] = []) => {
  if (!(ctx.role === "admin" || ctx.role === "super_admin" || ctx.isSuperAdmin)) {
    const err = new Error("当前身份没有清除操作记录的权限") as Error & { status?: number };
    err.status = 403;
    throw err;
  }

  const normalizedIds = Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean)));
  if (normalizedIds.length > 500 || normalizedIds.some((id) => !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))) {
    const err = new Error("操作记录 ID 无效") as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  const filters = [
    `team_id=eq.${encodeFilter(ctx.team.id)}`,
    normalizedIds.length ? `id=in.(${normalizedIds.map(encodeFilter).join(",")})` : "",
  ].filter(Boolean).join("&");

  const res = await supabaseAdminRestFetch(
    `user_r2_audit_logs?${filters}`,
    { method: "DELETE", prefer: "return=minimal" },
  );
  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(message || "清除操作记录失败");
  }
};
