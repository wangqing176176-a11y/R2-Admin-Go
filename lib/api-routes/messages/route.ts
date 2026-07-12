import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, listProfilesByUserIds } from "@/lib/access-control";
import { readSupabaseRestArray, supabaseAdminRestFetch } from "@/lib/supabase";
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
};

type ProfileRow = { user_id: string; display_name: string };

const encodeFilter = (value: string) => encodeURIComponent(value);
const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (row: MessageRow) => ({
  id: row.id,
  teamId: row.team_id,
  senderUserId: row.sender_user_id,
  recipientUserId: row.recipient_user_id,
  kind: row.kind,
  body: row.body,
  relatedType: row.related_type,
  relatedId: row.related_id,
  readAt: row.read_at,
  createdAt: row.created_at,
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    const [messageRes, memberRes] = await Promise.all([
      supabaseAdminRestFetch(
        `app_messages?select=id,team_id,sender_user_id,recipient_user_id,kind,body,related_type,related_id,read_at,created_at&team_id=eq.${encodeFilter(ctx.team.id)}&or=(sender_user_id.eq.${encodeFilter(ctx.user.id)},recipient_user_id.eq.${encodeFilter(ctx.user.id)})&order=created_at.desc&limit=1000`,
        { method: "GET" },
      ),
      supabaseAdminRestFetch(
        `app_team_members?select=user_id,role,status&team_id=eq.${encodeFilter(ctx.team.id)}&status=eq.active&order=created_at.asc`,
        { method: "GET" },
      ),
    ]);
    const [messages, members] = await Promise.all([
      readSupabaseRestArray<MessageRow>(messageRes, "读取消息失败"),
      readSupabaseRestArray<MemberRow>(memberRes, "读取团队成员失败"),
    ]);
    const profiles = (await listProfilesByUserIds(members.map((member) => member.user_id))) as ProfileRow[];
    const profileMap = new Map(profiles.map((profile) => [profile.user_id, profile.display_name]));

    return NextResponse.json(
      {
        messages: [...messages].reverse().map(toMessage),
        members: members.map((member) => ({
          userId: member.user_id,
          displayName: profileMap.get(member.user_id) || "未命名成员",
          role: member.role,
          status: member.status,
        })),
        serverTime: new Date().toISOString(),
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
    const body = (await req.json().catch(() => ({}))) as { recipientUserId?: unknown; body?: unknown };
    const recipientUserId = String(body.recipientUserId ?? "").trim();
    const messageBody = String(body.body ?? "").trim();
    if (!recipientUserId) return NextResponse.json({ error: "请选择消息接收人" }, { status: 400 });
    if (recipientUserId === ctx.user.id) return NextResponse.json({ error: "不能给自己发送消息" }, { status: 400 });
    if (!messageBody) return NextResponse.json({ error: "消息内容不能为空" }, { status: 400 });
    if (messageBody.length > 2000) return NextResponse.json({ error: "消息内容不能超过 2000 个字符" }, { status: 400 });

    const memberRes = await supabaseAdminRestFetch(
      `app_team_members?select=user_id&team_id=eq.${encodeFilter(ctx.team.id)}&user_id=eq.${encodeFilter(recipientUserId)}&status=eq.active&limit=1`,
      { method: "GET" },
    );
    const members = await readSupabaseRestArray<{ user_id: string }>(memberRes, "读取团队成员失败");
    if (!members[0]?.user_id) return NextResponse.json({ error: "接收人不在当前团队中" }, { status: 404 });

    const createRes = await supabaseAdminRestFetch("app_messages", {
      method: "POST",
      body: {
        team_id: ctx.team.id,
        sender_user_id: ctx.user.id,
        recipient_user_id: recipientUserId,
        kind: "direct",
        body: messageBody,
      },
      prefer: "return=representation",
    });
    const rows = await readSupabaseRestArray<MessageRow>(createRes, "发送消息失败");
    if (!rows[0]?.id) throw new Error("发送消息失败");
    return NextResponse.json({ success: true, message: toMessage(rows[0]) });
  } catch (error) {
    return NextResponse.json({ error: toChineseErrorMessage(error, "发送消息失败") }, { status: toStatus(error) });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as { peerUserId?: unknown; system?: unknown };
    const peerUserId = String(body.peerUserId ?? "").trim();
    const system = body.system === true;
    if (!system && !peerUserId) return NextResponse.json({ error: "缺少会话信息" }, { status: 400 });

    const filter = system
      ? `team_id=eq.${encodeFilter(ctx.team.id)}&recipient_user_id=eq.${encodeFilter(ctx.user.id)}&kind=eq.system&read_at=is.null`
      : `team_id=eq.${encodeFilter(ctx.team.id)}&recipient_user_id=eq.${encodeFilter(ctx.user.id)}&sender_user_id=eq.${encodeFilter(peerUserId)}&kind=eq.direct&read_at=is.null`;
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
