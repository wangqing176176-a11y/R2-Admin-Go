import { supabaseAdminRestFetch } from "@/lib/supabase";
import {
  normalizeTeamPreviewMode,
  normalizeTeamPreviewSettings,
  previewModeFromSettings,
  settingsFromPreviewMode,
  type TeamPreviewMode,
  type TeamPreviewSettings,
} from "@/lib/preview-policy";

export type TeamPreviewConfig = {
  mode: TeamPreviewMode;
  settings: TeamPreviewSettings;
};

export const getTeamPreviewConfig = async (teamId: string): Promise<TeamPreviewConfig> => {
  const res = await supabaseAdminRestFetch(
    `app_teams?select=preview_mode,preview_settings&id=eq.${encodeURIComponent(teamId)}&limit=1`,
    { method: "GET" },
  );

  if (res.ok) {
    const rows = (await res.json().catch(() => [])) as Array<{ preview_mode?: unknown; preview_settings?: unknown }>;
    const legacyMode = normalizeTeamPreviewMode(rows[0]?.preview_mode);
    const settings = normalizeTeamPreviewSettings(rows[0]?.preview_settings, legacyMode);
    return { mode: previewModeFromSettings(settings), settings };
  }

  // 兼容只执行过旧版 preview_mode 迁移的部署。
  const legacyRes = await supabaseAdminRestFetch(
    `app_teams?select=preview_mode&id=eq.${encodeURIComponent(teamId)}&limit=1`,
    { method: "GET" },
  );
  if (!legacyRes.ok) return { mode: "local", settings: settingsFromPreviewMode("local") };
  const legacyRows = (await legacyRes.json().catch(() => [])) as Array<{ preview_mode?: unknown }>;
  const mode = normalizeTeamPreviewMode(legacyRows[0]?.preview_mode);
  return { mode, settings: settingsFromPreviewMode(mode) };
};

export const getTeamPreviewMode = async (teamId: string): Promise<TeamPreviewMode> =>
  (await getTeamPreviewConfig(teamId)).mode;
