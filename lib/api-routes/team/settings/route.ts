import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest, invalidateAppAccessContextCache, requirePermission } from "@/lib/access-control";
import { toChineseErrorMessage } from "@/lib/error-zh";
import { supabaseAdminRestFetch } from "@/lib/supabase";
import {
  normalizeTeamPreviewMode,
  normalizeTeamPreviewSettings,
  previewModeFromSettings,
  settingsFromPreviewMode,
  type TeamPreviewMode,
  type TeamPreviewSettings,
} from "@/lib/preview-policy";

export const runtime = "edge";

const encodeFilter = (value: string) => encodeURIComponent(value);

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown, fallback: string) => toChineseErrorMessage(error, fallback);

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "team.member.manage", "你没有修改团队设置的权限");

    const body = (await req.json().catch(() => ({}))) as { name?: unknown; previewMode?: unknown; previewSettings?: unknown };
    const hasName = Object.prototype.hasOwnProperty.call(body, "name");
    const hasPreviewMode = Object.prototype.hasOwnProperty.call(body, "previewMode");
    const hasPreviewSettings = Object.prototype.hasOwnProperty.call(body, "previewSettings");
    if (!hasName && !hasPreviewMode && !hasPreviewSettings) {
      return NextResponse.json({ error: "没有需要更新的团队设置" }, { status: 400 });
    }

    const name = String(body.name ?? "").trim();
    if (hasName && !name) return NextResponse.json({ error: "团队名称不能为空" }, { status: 400 });
    if (hasName && name.length > 48) {
      return NextResponse.json({ error: "团队名称不能超过 48 个字符" }, { status: 400 });
    }
    const rawPreviewMode = String(body.previewMode ?? "");
    if (hasPreviewMode && rawPreviewMode !== "local" && rawPreviewMode !== "third_party") {
      return NextResponse.json({ error: "无效的预览源配置" }, { status: 400 });
    }
    if (hasPreviewSettings) {
      const value = body.previewSettings as Partial<Record<keyof TeamPreviewSettings, unknown>> | null;
      if (
        !value ||
        (value.office !== "local" && value.office !== "microsoft") ||
        (value.design !== "local" && value.design !== "photopea") ||
        (value.xmind !== "local" && value.xmind !== "xmind")
      ) {
        return NextResponse.json({ error: "预览源详细配置不完整或包含无效选项" }, { status: 400 });
      }
    }
    const legacyMode: TeamPreviewMode = normalizeTeamPreviewMode(rawPreviewMode);
    const previewSettings = hasPreviewSettings
      ? normalizeTeamPreviewSettings(body.previewSettings)
      : settingsFromPreviewMode(legacyMode);
    const previewMode = previewModeFromSettings(previewSettings);
    const updates: Record<string, unknown> = {};
    if (hasName) updates.name = name;
    if (hasPreviewMode || hasPreviewSettings) {
      updates.preview_mode = previewMode;
      updates.preview_settings = previewSettings;
    }

    const res = await supabaseAdminRestFetch(`app_teams?id=eq.${encodeFilter(ctx.team.id)}`, {
      method: "PATCH",
      body: updates,
      prefer: "return=minimal",
    });
    if (!res.ok) {
      throw new Error(hasPreviewMode || hasPreviewSettings ? "更新预览源失败，请先执行数据库预览配置迁移" : "更新团队名称失败");
    }
    invalidateAppAccessContextCache(ctx.token);

    return NextResponse.json({
      success: true,
      team: {
        id: ctx.team.id,
        name: hasName ? name : ctx.team.name,
        ...(hasPreviewMode || hasPreviewSettings ? { previewMode, previewSettings } : {}),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error, "更新团队设置失败") }, { status: toStatus(error) });
  }
}
