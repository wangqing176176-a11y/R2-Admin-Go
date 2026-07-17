import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, listProfilesByUserIds } from "@/lib/access-control";
import { readSupabaseRestArray, supabaseAdminAuthFetch, supabaseAdminRestFetch } from "@/lib/supabase";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

type MessageRow = {
  id: string;
  team_id: string;
  sender_user_id: string | null;
  recipient_user_id: string;
  kind: "direct" | "system";
  body: string;
  related_type: string | null;
  related_id: string | null;
  read_at: string | null;
  created_at: string;
};

type MemberRow = {
  user_id: string;
  role: "super_admin" | "admin" | "member";
  status: "active" | "disabled";
  created_at: string;
};

type ProfileRow = { user_id: string; display_name: string; updated_at?: string | null };
type AuthUser = {
  id: string;
  email: string;
  createdAt: string | null;
  lastSignInAt: string | null;
};
type MessageFileAttachment = {
  bucketId: string;
  key: string;
  name: string;
  size?: number;
  storageKey?: string;
};

const FILE_MESSAGE_PREFIX = "[[R2_FILE_V1]]";
const GROUP_RELATED_TYPE = "team_group";

const encodeFilter = (value: string) => encodeURIComponent(value);
const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const parseFileAttachment = (body: string): MessageFileAttachment | null => {
  if (!body.startsWith(FILE_MESSAGE_PREFIX)) return null;
  try {
    const raw = JSON.parse(body.slice(FILE_MESSAGE_PREFIX.length)) as Record<string, unknown>;
    const bucketId = String(raw.bucketId ?? "").trim();
    const key = String(raw.key ?? "").trim();
    const name = String(raw.name ?? "").trim();
    if (!bucketId || !key || !name) return null;
    const size = Number(raw.size);
    const storageKey = String(raw.storageKey ?? "").trim();
    return {
      bucketId,
      key,
      name,
      ...(Number.isFinite(size) && size >= 0 ? { size } : {}),
      ...(storageKey ? { storageKey } : {}),
    };
  } catch {
    return null;
  }
};

const toMessage = (row: MessageRow) => {
  const attachment = parseFileAttachment(row.body);
  return {
    id: row.id,
    teamId: row.team_id,
    senderUserId: row.sender_user_id,
    recipientUserId: row.recipient_user_id,
    kind: row.kind,
    body: attachment ? "" : row.body,
    relatedType: row.related_type,
    relatedId: row.related_id,
    readAt: row.read_at,
    createdAt: row.created_at,
    isGroup: row.related_type === GROUP_RELATED_TYPE,
    attachment,
  };
};

const readAuthUsers = async (): Promise<AuthUser[]> => {
  const res = await supabaseAdminAuthFetch("/admin/users?page=1&per_page=1000", { method: "GET" });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }
  if (!res.ok) return [];
  return (Array.isArray(data.users) ? data.users : []).map((value) => {
    const user = value as Record<string, unknown>;
    return {
      id: String(user.id ?? ""),
      email: String(user.email ?? ""),
      createdAt: typeof user.created_at === "string" ? user.created_at : null,
      lastSignInAt: typeof user.last_sign_in_at === "string" ? user.last_sign_in_at : null,
    };
  }).filter((user) => user.id);
};

const normalizeAttachment = (value: unknown): MessageFileAttachment | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const bucketId = String(raw.bucketId ?? "").trim();
  const key = String(raw.key ?? "").trim();
  const name = String(raw.name ?? "").trim();
  const storageKey = String(raw.storageKey ?? "").trim();
  const size = Number(raw.size);
  if (!bucketId || !key || !name || bucketId.length > 160 || key.length > 1024 || name.length > 255) return null;
  return {
    bucketId,
    key,
    name,
    ...(Number.isFinite(size) && size >= 0 ? { size } : {}),
    ...(storageKey ? { storageKey } : {}),
  };
};

const dedupeGroupRows = (rows: MessageRow[], currentUserId: string) => {
  const directRows: MessageRow[] = [];
  const groupRows = new Map<string, MessageRow>();
  for (const row of rows) {
    if (row.related_type !== GROUP_RELATED_TYPE) {
      directRows.push(row);
      continue;
    }
    const key = row.related_id || row.id;
    const existing = groupRows.get(key);
    if (!existing || row.recipient_user_id === currentUserId) groupRows.set(key, row);
  }
  return [...directRows, ...groupRows.values()].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );
};

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    const [messageRes, memberRes, authUsers] = await Promise.all([
      supabaseAdminRestFetch(
        `app_messages?select=id,team_id,sender_user_id,recipient_user_id,kind,body,related_type,related_id,read_at,created_at&team_id=eq.${encodeFilter(ctx.team.id)}&or=(sender_user_id.eq.${encodeFilter(ctx.user.id)},recipient_user_id.eq.${encodeFilter(ctx.user.id)})&order=created_at.desc&limit=1000`,
        { method: "GET" },
      ),
      supabaseAdminRestFetch(
        `app_team_members?select=user_id,role,status,created_at&team_id=eq.${encodeFilter(ctx.team.id)}&status=eq.active&order=created_at.asc`,
        { method: "GET" },
      ),
      readAuthUsers(),
    ]);
    const [messages, members] = await Promise.all([
      readSupabaseRestArray<MessageRow>(messageRes, "读取消息失败"),
      readSupabaseRestArray<MemberRow>(memberRes, "读取团队成员失败"),
    ]);
    const profiles = (await listProfilesByUserIds(members.map((member) => member.user_id))) as ProfileRow[];
    const now = new Date();
    const currentProfile = profiles.find((profile) => profile.user_id === ctx.user.id);
    const currentLastActiveMs = currentProfile?.updated_at ? Date.parse(currentProfile.updated_at) : 0;
    if (!Number.isFinite(currentLastActiveMs) || now.getTime() - currentLastActiveMs > 45_000) {
      await supabaseAdminRestFetch(`app_user_profiles?user_id=eq.${encodeFilter(ctx.user.id)}`, {
        method: "PATCH",
        body: { updated_at: now.toISOString() },
        prefer: "return=minimal",
      });
    }
    const profileMap = new Map(profiles.map((profile) => [profile.user_id, profile.display_name]));
    const profileRecordMap = new Map(profiles.map((profile) => [profile.user_id, profile]));
    const authUserMap = new Map(authUsers.map((user) => [user.id, user]));

    return NextResponse.json(
      {
        messages: dedupeGroupRows(messages, ctx.user.id).map(toMessage),
        members: members.map((member) => ({
          userId: member.user_id,
          displayName: profileMap.get(member.user_id) || "未命名成员",
          email: authUserMap.get(member.user_id)?.email || "",
          role: member.role,
          status: member.status,
          joinedAt: member.created_at,
          registeredAt: authUserMap.get(member.user_id)?.createdAt || null,
          lastSignInAt: authUserMap.get(member.user_id)?.lastSignInAt || null,
          lastActiveAt: member.user_id === ctx.user.id
            ? now.toISOString()
            : profileRecordMap.get(member.user_id)?.updated_at || null,
        })),
        serverTime: now.toISOString(),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: toChineseErrorMessage(error, "读取消息失败") },
      { status: toStatus(error), headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as {
      recipientUserId?: unknown;
      body?: unknown;
      group?: unknown;
      attachments?: unknown;
    };
    const isGroup = body.group === true;
    const recipientUserId = String(body.recipientUserId ?? "").trim();
    const messageBody = String(body.body ?? "").trim();
    const attachmentInputs = Array.isArray(body.attachments) ? body.attachments : [];
    if (attachmentInputs.length > 20) return NextResponse.json({ error: "单次最多发送 20 个文件" }, { status: 400 });
    const attachments = attachmentInputs.map(normalizeAttachment);
    if (attachments.some((attachment) => !attachment)) {
      return NextResponse.json({ error: "文件信息不完整，请重新选择" }, { status: 400 });
    }
    if (!isGroup && !recipientUserId) return NextResponse.json({ error: "请选择消息接收人" }, { status: 400 });
    if (!isGroup && recipientUserId === ctx.user.id) return NextResponse.json({ error: "不能给自己发送消息" }, { status: 400 });
    if (!messageBody && attachments.length === 0) return NextResponse.json({ error: "消息内容不能为空" }, { status: 400 });
    if (messageBody.length > 2000) return NextResponse.json({ error: "消息内容不能超过 2000 个字符" }, { status: 400 });

    const memberRes = await supabaseAdminRestFetch(
      `app_team_members?select=user_id&team_id=eq.${encodeFilter(ctx.team.id)}&status=eq.active${isGroup ? "" : `&user_id=eq.${encodeFilter(recipientUserId)}&limit=1`}`,
      { method: "GET" },
    );
    const members = await readSupabaseRestArray<{ user_id: string }>(memberRes, "读取团队成员失败");
    if (!members[0]?.user_id) return NextResponse.json({ error: isGroup ? "当前团队没有可用成员" : "接收人不在当前团队中" }, { status: 404 });

    const logicalBodies = [
      ...(messageBody ? [messageBody] : []),
      ...(attachments.filter((attachment): attachment is MessageFileAttachment => Boolean(attachment)).map(
        (attachment) => `${FILE_MESSAGE_PREFIX}${JSON.stringify(attachment)}`,
      )),
    ];
    if (logicalBodies.some((value) => value.length > 2000)) {
      return NextResponse.json({ error: "文件路径过长，暂时无法发送" }, { status: 400 });
    }
    const recipientIds = isGroup ? members.map((member) => member.user_id) : [recipientUserId];
    const now = new Date().toISOString();
    const insertRows = logicalBodies.flatMap((value) => {
      const relatedId = isGroup ? crypto.randomUUID() : null;
      return recipientIds.map((targetUserId) => ({
        team_id: ctx.team.id,
        sender_user_id: ctx.user.id,
        recipient_user_id: targetUserId,
        kind: "direct",
        body: value,
        related_type: isGroup ? GROUP_RELATED_TYPE : value.startsWith(FILE_MESSAGE_PREFIX) ? "file_attachment" : null,
        related_id: relatedId,
        read_at: isGroup && targetUserId === ctx.user.id ? now : null,
      }));
    });
    const createRes = await supabaseAdminRestFetch("app_messages", {
      method: "POST",
      body: insertRows,
      prefer: "return=representation",
    });
    const rows = await readSupabaseRestArray<MessageRow>(createRes, "发送消息失败");
    if (!rows[0]?.id) throw new Error("发送消息失败");
    const logicalRows = isGroup ? dedupeGroupRows(rows, ctx.user.id) : rows;
    return NextResponse.json({ success: true, messages: logicalRows.map(toMessage) });
  } catch (error) {
    return NextResponse.json({ error: toChineseErrorMessage(error, "发送消息失败") }, { status: toStatus(error) });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as { peerUserId?: unknown; system?: unknown; group?: unknown };
    const peerUserId = String(body.peerUserId ?? "").trim();
    const system = body.system === true;
    const group = body.group === true;
    if (!system && !group && !peerUserId) return NextResponse.json({ error: "缺少会话信息" }, { status: 400 });

    const filter = system
      ? `team_id=eq.${encodeFilter(ctx.team.id)}&recipient_user_id=eq.${encodeFilter(ctx.user.id)}&kind=eq.system&read_at=is.null`
      : group
        ? `team_id=eq.${encodeFilter(ctx.team.id)}&recipient_user_id=eq.${encodeFilter(ctx.user.id)}&related_type=eq.${GROUP_RELATED_TYPE}&read_at=is.null`
        : `team_id=eq.${encodeFilter(ctx.team.id)}&recipient_user_id=eq.${encodeFilter(ctx.user.id)}&sender_user_id=eq.${encodeFilter(peerUserId)}&kind=eq.direct&or=(related_type.is.null,related_type.neq.${GROUP_RELATED_TYPE})&read_at=is.null`;
    const patchRes = await supabaseAdminRestFetch(`app_messages?${filter}`, {
      method: "PATCH",
      body: { read_at: new Date().toISOString() },
      prefer: "return=minimal",
    });
    if (!patchRes.ok) throw new Error("更新消息状态失败");
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: toChineseErrorMessage(error, "更新消息状态失败") }, { status: toStatus(error) });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as {
      peerUserId?: unknown;
      system?: unknown;
      group?: unknown;
      clearAll?: unknown;
      dateFrom?: unknown;
      dateTo?: unknown;
    };
    const peerUserId = String(body.peerUserId ?? "").trim();
    const system = body.system === true;
    const group = body.group === true;
    const clearAll = body.clearAll === true;
    if (!system && !group && !peerUserId) return NextResponse.json({ error: "缺少会话信息" }, { status: 400 });
    if (!system && !group && peerUserId === ctx.user.id) return NextResponse.json({ error: "会话信息无效" }, { status: 400 });

    let dateFilter = "";
    if (!clearAll) {
      const dateFrom = new Date(String(body.dateFrom ?? ""));
      const dateTo = new Date(String(body.dateTo ?? ""));
      if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime()) || dateFrom >= dateTo) {
        return NextResponse.json({ error: "请选择有效的销毁日期范围" }, { status: 400 });
      }
      dateFilter = `&created_at=gte.${encodeFilter(dateFrom.toISOString())}&created_at=lt.${encodeFilter(dateTo.toISOString())}`;
    }

    const conversationFilter = system
      ? `team_id=eq.${encodeFilter(ctx.team.id)}&recipient_user_id=eq.${encodeFilter(ctx.user.id)}&kind=eq.system`
      : group
        ? `team_id=eq.${encodeFilter(ctx.team.id)}&related_type=eq.${GROUP_RELATED_TYPE}&or=(recipient_user_id.eq.${encodeFilter(ctx.user.id)},sender_user_id.eq.${encodeFilter(ctx.user.id)})`
        : `team_id=eq.${encodeFilter(ctx.team.id)}&kind=eq.direct&and=(or(related_type.is.null,related_type.neq.${GROUP_RELATED_TYPE}),or(and(sender_user_id.eq.${encodeFilter(ctx.user.id)},recipient_user_id.eq.${encodeFilter(peerUserId)}),and(sender_user_id.eq.${encodeFilter(peerUserId)},recipient_user_id.eq.${encodeFilter(ctx.user.id)})))`;
    const deleteRes = await supabaseAdminRestFetch(`app_messages?select=id&${conversationFilter}${dateFilter}`, {
      method: "DELETE",
      prefer: "return=representation",
    });
    const deleted = await readSupabaseRestArray<{ id: string }>(deleteRes, "销毁聊天记录失败");
    return NextResponse.json({ success: true, deletedCount: deleted.length });
  } catch (error) {
    return NextResponse.json({ error: toChineseErrorMessage(error, "销毁聊天记录失败") }, { status: toStatus(error) });
  }
}
