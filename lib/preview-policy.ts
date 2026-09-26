import { isMlightCadSupported } from "@/lib/mlightcad";
import {
  isBrowserPlayableAudioExt,
  isBrowserPlayableVideoExt,
  isLocalMediaOpenExt,
} from "@/lib/media-preview";
import { isPhotopeaSupported } from "@/lib/photopea";

export type TeamPreviewMode = "local" | "third_party";

export type TeamPreviewSettings = {
  office: "local" | "microsoft" | "onlyoffice";
  design: "local" | "photopea";
  xmind: "local" | "xmind";
  pdf: "component" | "browser" | "disabled";
  image: "component" | "browser" | "disabled";
  archive: "component" | "disabled";
  ebook: "component" | "disabled";
  model: "component" | "disabled";
  cad: "component" | "disabled";
  video: "component" | "browser" | "disabled";
  audio: "component" | "browser" | "disabled";
  markdown: "component" | "disabled";
  text: "component" | "disabled";
  code: "component" | "disabled";
};

export type TeamPreviewPreset = "best" | "safe" | "custom";

export const SAFE_PREVIEW_SETTINGS: TeamPreviewSettings = {
  office: "local",
  design: "local",
  xmind: "local",
  pdf: "component",
  image: "component",
  archive: "component",
  ebook: "component",
  model: "component",
  cad: "component",
  video: "component",
  audio: "component",
  markdown: "component",
  text: "component",
  code: "component",
};

export const BEST_PREVIEW_SETTINGS: TeamPreviewSettings = {
  ...SAFE_PREVIEW_SETTINGS,
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
  | "ebook"
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
  "3dm", "3ds", "3mf", "amf", "bim", "brp", "brep", "dae", "fbx", "fcstd", "glb",
  "gltf", "ifc", "igs", "iges", "obj", "off", "ply", "step", "stl", "stp", "wrl",
]);

const LOCAL_ARCHIVE_EXTENSIONS = new Set([
  "7z", "bz2", "cab", "ear", "gz", "jar", "lz", "lz4", "lzma", "rar", "tar", "tbz",
  "tbz2", "tgz", "txz", "tzst", "war", "xz", "zip", "zst",
]);

const TEXT_EXTENSIONS = new Set([
  "adoc", "ahk", "asciidoc", "ass", "bash", "bat", "bib", "c", "cc", "cfg", "cls",
  "cmd", "cjs", "conf", "config", "cpp", "cs", "css", "csv", "cts", "cxx", "dart",
  "editorconfig", "env", "fish", "gitattributes", "gitignore", "go", "gql", "graphql", "h",
  "hh", "hpp", "htm", "html", "hxx", "ical", "ics", "ini", "java", "jl", "js", "json",
  "jsonl", "jsx", "kt", "kts", "less", "lock", "log", "lrc", "lua", "markdown", "md",
  "mdx", "mht", "mhtml", "mjs", "ndjson", "npmrc", "nvmrc", "opml", "org", "php", "pl",
  "pm", "properties", "proto", "ps1", "psm1", "py", "pyw", "r", "rb", "rs", "rst", "sass",
  "sc", "scala", "scss", "sh", "smi", "sql", "srt", "ssa", "sty", "sub", "svelte", "swift",
  "tex", "text", "toml", "ts", "tsx", "tsv", "ttml", "txt", "vbs", "vcard", "vcf", "vtt",
  "vue", "xhtml", "xml", "yaml", "yml", "zsh",
]);

const MARKDOWN_EXTENSIONS = new Set(["markdown", "md", "mdx"]);
const PLAIN_TEXT_EXTENSIONS = new Set([
  "adoc", "asciidoc", "ass", "csv", "ical", "ics", "json", "jsonl", "log", "lrc", "ndjson",
  "opml", "org", "rst", "smi", "srt", "ssa", "sub", "text", "tsv", "ttml", "txt", "vcard",
  "vcf", "vtt",
]);
const SPECIAL_TEXT_FILE_NAMES = new Set([
  "authors", "brewfile", "changelog", "codeowners", "containerfile", "copying", "dockerfile",
  "gemfile", "license", "makefile", "notice", "procfile", "readme", "todo",
]);

const getBaseName = (name: string) => String(name ?? "").split(/[?#]/, 1)[0].split(/[\\/]/).pop()?.toLowerCase() ?? "";

const isSpecialTextFileName = (name: string) => {
  const baseName = getBaseName(name);
  if (SPECIAL_TEXT_FILE_NAMES.has(baseName)) return true;
  if (/^(readme|license|copying|changelog|notice)(\.[a-z0-9_-]+)?$/.test(baseName)) return true;
  if (/^(dockerfile|containerfile|makefile)(\..+)?$/.test(baseName)) return true;
  return /^\.(env|eslint|prettier|stylelint|npmrc|nvmrc|gitignore|gitattributes)(\..+)?$/.test(baseName);
};

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
    office: input.office === "microsoft" || input.office === "onlyoffice"
      ? input.office
      : input.office === "local" ? "local" : fallback.office,
    design: input.design === "photopea" ? "photopea" : input.design === "local" ? "local" : fallback.design,
    xmind: input.xmind === "xmind" ? "xmind" : input.xmind === "local" ? "local" : fallback.xmind,
    pdf: input.pdf === "browser" || input.pdf === "disabled" || input.pdf === "component" ? input.pdf : fallback.pdf,
    image: input.image === "browser" || input.image === "disabled" || input.image === "component" ? input.image : fallback.image,
    archive: input.archive === "disabled" || input.archive === "component" ? input.archive : fallback.archive,
    ebook: input.ebook === "disabled" || input.ebook === "component" ? input.ebook : fallback.ebook,
    model: input.model === "disabled" || input.model === "component" ? input.model : fallback.model,
    cad: input.cad === "disabled" || input.cad === "component" ? input.cad : fallback.cad,
    video: input.video === "browser" || input.video === "disabled" || input.video === "component" ? input.video : fallback.video,
    audio: input.audio === "browser" || input.audio === "disabled" || input.audio === "component" ? input.audio : fallback.audio,
    markdown: input.markdown === "disabled" || input.markdown === "component" ? input.markdown : fallback.markdown,
    text: input.text === "disabled" || input.text === "component" ? input.text : fallback.text,
    code: input.code === "disabled" || input.code === "component" ? input.code : fallback.code,
  };
};

export const getTeamPreviewPreset = (settings: TeamPreviewSettings): TeamPreviewPreset => {
  const hasDefaultLocalComponents = Object.entries(SAFE_PREVIEW_SETTINGS)
    .filter(([key]) => key !== "office" && key !== "design" && key !== "xmind")
    .every(([key, value]) => settings[key as keyof TeamPreviewSettings] === value);
  if (hasDefaultLocalComponents && settings.office === "local" && settings.design === "local" && settings.xmind === "local") return "safe";
  if (hasDefaultLocalComponents && settings.office === "microsoft" && settings.design === "photopea" && settings.xmind === "xmind") return "best";
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

const textPreviewSettingForExtension = (ext: string, settings: TeamPreviewSettings) => {
  if (MARKDOWN_EXTENSIONS.has(ext)) return settings.markdown;
  if (PLAIN_TEXT_EXTENSIONS.has(ext)) return settings.text;
  return settings.code;
};

export const getLocalPreviewRenderer = (
  name: string,
  settings: TeamPreviewSettings,
): "component" | "browser" => {
  const ext = getPreviewFileExt(name);
  if (ext === "pdf") return settings.pdf === "browser" ? "browser" : "component";
  if (LOCAL_IMAGE_EXTENSIONS.has(ext)) return settings.image === "browser" ? "browser" : "component";
  if (isBrowserPlayableVideoExt(ext)) return settings.video === "browser" ? "browser" : "component";
  if (isBrowserPlayableAudioExt(ext)) return settings.audio === "browser" ? "browser" : "component";
  return "component";
};

export const resolvePreviewKind = (name: string, config: TeamPreviewMode | TeamPreviewSettings): PreviewKind => {
  const ext = getPreviewFileExt(name);
  const settings = typeof config === "string" ? settingsFromPreviewMode(config) : config;

  if (ext === "pdf" && settings.pdf !== "disabled") return "pdf";
  if (LOCAL_IMAGE_EXTENSIONS.has(ext) && settings.image !== "disabled") return "image";
  if (LOCAL_ARCHIVE_EXTENSIONS.has(ext) && settings.archive !== "disabled") return "archive";
  if (ext === "epub" && settings.ebook !== "disabled") return "ebook";
  if (isMlightCadSupported(ext) && settings.cad !== "disabled") return "cad";
  if (LOCAL_MODEL_EXTENSIONS.has(ext) && settings.model !== "disabled") return "model";
  if (isBrowserPlayableVideoExt(ext) && settings.video !== "disabled") return "video";
  if (isBrowserPlayableAudioExt(ext) && settings.audio !== "disabled") return "audio";
  if (isLocalMediaOpenExt(ext)) return "local-media";
  if ((isTextPreviewSupported(ext) || isSpecialTextFileName(name)) && textPreviewSettingForExtension(ext, settings) !== "disabled") return "text";

  if (settings.office !== "local" && /^(doc|docx|ppt|pptx|xls|xlsx)$/.test(ext)) return "office";
  if (settings.design === "photopea" && isPhotopeaSupported(ext)) return "photopea";
  if (settings.xmind === "xmind" && ext === "xmind") return "xmind";

  return "other";
};

export const previewKindNeedsSameOriginFetch = (kind: PreviewKind) =>
  kind === "archive" || kind === "ebook" || kind === "model" || kind === "xmind" || kind === "cad" || kind === "photopea";
