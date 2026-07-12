import { supabaseAdminRestFetch } from "@/lib/supabase";

type SystemMessageInput = {
  teamId: string;
  recipientUserIds: string[];
  body: string;
  relatedType?: string;
  relatedId?: string;
};

export const createSystemMessages = async ({
  teamId,
  recipientUserIds,
  body,
  relatedType = "system",
  relatedId,
}: SystemMessageInput) => {
  const recipients = Array.from(new Set(recipientUserIds.map((id) => id.trim()).filter(Boolean)));
  if (!recipients.length || !body.trim()) return;

  const res = await supabaseAdminRestFetch("app_messages", {
    method: "POST",
    body: recipients.map((recipientUserId) => ({
      team_id: teamId,
      sender_user_id: null,
      recipient_user_id: recipientUserId,
      kind: "system",
      body: body.trim().slice(0, 2000),
      related_type: relatedType,
      related_id: relatedId || null,
    })),
    prefer: "return=minimal",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || "创建系统消息失败");
  }
};

