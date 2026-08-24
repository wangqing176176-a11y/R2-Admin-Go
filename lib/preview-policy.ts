import { isMlightCadSupported } from "@/lib/mlightcad";
import {
  isBrowserPlayableAudioExt,
  isBrowserPlayableVideoExt,
  isLocalMediaOpenExt,
} from "@/lib/media-preview";
import { isPhotopeaSupported } from "@/lib/photopea";

export type TeamPreviewMode = "local" | "third_party";

export type TeamPreviewSettings = {
  office: "local" | "microsoft";
  design: "local" | "photopea";
  xmind: "local" | "xmind";
};

export type TeamPreviewPreset = "best" | "safe" | "custom";

export const SAFE_PREVIEW_SETTINGS: TeamPreviewSettings = {
  office: "local",
  design: "local",
  xmind: "local",
};

export const BEST_PREVIEW_SETTINGS: TeamPreviewSettings = {
  office: "microsoft",
  design: "photopea",
  xmind: "xmind",
};

export type PreviewKind =
  | "image"
  | "video"
  | "audio"
  | "local-media"
  | "text"
  | "pdf"
  | "archive"
  | "model"
  | "xmind"
  | "office"
  | "photopea"
  | "cad"
  | "other";

const LOCAL_IMAGE_EXTENSIONS = new Set([
  "avif", "bmp", "gif", "ico", "jfif", "jpeg", "jpg", "png", "svg", "webp",
]);

const LOCAL_MODEL_EXTENSIONS = new Set([
  "3ds", "3mf", "bim", "dae", "fbx", "glb", "gltf", "obj", "off", "ply", "stl", "wrl",
]);

const TEXT_EXTENSIONS = new Set([
  "bash", "bat", "c", "cc", "cmd", "conf", "config", "cpp", "cs", "css", "csv",
  "cxx", "env", "go", "h", "hpp", "htm", "html", "ini", "java", "js", "json",
  "jsonl", "jsx", "kt", "less", "log", "markdown", "md", "php", "properties",
  "py", "rb", "rs", "scss", "sh", "sql", "svelte", "swift", "text", "toml",
  "ts", "tsx", "tsv", "txt", "vue", "xml", "yaml", "yml", "zsh",
]);

export const normalizeTeamPreviewMode = (value: unknown): TeamPreviewMode =>
  value === "third_party" ? "third_party" : "local";

export const settingsFromPreviewMode = (mode: TeamPreviewMode): TeamPreviewSettings =>
  mode === "third_party" ? { ...BEST_PREVIEW_SETTINGS } : { ...SAFE_PREVIEW_SETTINGS };

export const normalizeTeamPreviewSettings = (
  value: unknown,
  fallbackMode: TeamPreviewMode = "local",
): TeamPreviewSettings => {
  const fallback = settingsFromPreviewMode(fallbackMode);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const input = value as Record<string, unknown>;
  return {
    office: input.office === "microsoft" ? "microsoft" : input.office === "local" ? "local" : fallback.office,
    design: input.design === "photopea" ? "photopea" : input.design === "local" ? "local" : fallback.design,
    xmind: input.xmind === "xmind" ? "xmind" : input.xmind === "local" ? "local" : fallback.xmind,
  };
};

export const getTeamPreviewPreset = (settings: TeamPreviewSettings): TeamPreviewPreset => {
  const values = Object.values(settings);
  if (values.every((value) => value === "local")) return "safe";
  if (settings.office === "microsoft" && settings.design === "photopea" && settings.xmind === "xmind") return "best";
  return "custom";
};

export const previewModeFromSettings = (settings: TeamPreviewSettings): TeamPreviewMode =>
  getTeamPreviewPreset(settings) === "safe" ? "local" : "third_party";

export const getPreviewFileExt = (name: string) => {
  const normalized = String(name ?? "").split(/[?#]/, 1)[0];
  const idx = normalized.lastIndexOf(".");
  if (idx < 0 || idx === normalized.length - 1) return "";
  return normalized.slice(idx + 1).toLowerCase();
};

export const isTextPreviewSupported = (ext: string) => TEXT_EXTENSIONS.has(ext.toLowerCase());

export const resolvePreviewKind = (name: string, config: TeamPreviewMode | TeamPreviewSettings): PreviewKind => {
  const ext = getPreviewFileExt(name);
  const settings = typeof config === "string" ? settingsFromPreviewMode(config) : config;

  if (ext === "pdf") return "pdf";
  if (LOCAL_IMAGE_EXTENSIONS.has(ext)) return "image";
  if (ext === "zip") return "archive";
  if (isMlightCadSupported(ext)) return "cad";
  if (LOCAL_MODEL_EXTENSIONS.has(ext)) return "model";
  if (isBrowserPlayableVideoExt(ext)) return "video";
  if (isBrowserPlayableAudioExt(ext)) return "audio";
  if (isLocalMediaOpenExt(ext)) return "local-media";
  if (isTextPreviewSupported(ext)) return "text";

  if (settings.office === "microsoft" && /^(doc|docx|ppt|pptx|xls|xlsx)$/.test(ext)) return "office";
  if (settings.design === "photopea" && isPhotopeaSupported(ext)) return "photopea";
  if (settings.xmind === "xmind" && ext === "xmind") return "xmind";

  return "other";
};

export const previewKindNeedsSameOriginFetch = (kind: PreviewKind) =>
  kind === "pdf" || kind === "archive" || kind === "model" || kind === "xmind" || kind === "cad" || kind === "photopea";
