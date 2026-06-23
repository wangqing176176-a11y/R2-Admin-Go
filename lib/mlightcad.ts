const DEFAULT_MLIGHTCAD_VIEWER_URL = "/cad-viewer";
const DEFAULT_MLIGHTCAD_URL_PARAM = "url";

const MLIGHTCAD_EXTENSIONS = new Set(["dwg", "dxf", "dwt"]);

export const isMlightCadSupported = (extension: string) =>
  MLIGHTCAD_EXTENSIONS.has(String(extension ?? "").trim().toLowerCase());

export const buildMlightCadPreviewUrl = (sourceUrl: string, filename?: string) => {
  const baseUrl = String(process.env.NEXT_PUBLIC_MLIGHTCAD_VIEWER_URL || DEFAULT_MLIGHTCAD_VIEWER_URL).trim();
  const source = String(sourceUrl ?? "").trim();
  if (!baseUrl || !source) return "";

  const urlParam = String(process.env.NEXT_PUBLIC_MLIGHTCAD_URL_PARAM || DEFAULT_MLIGHTCAD_URL_PARAM).trim() || DEFAULT_MLIGHTCAD_URL_PARAM;

  try {
    const viewerUrl = new URL(baseUrl);
    viewerUrl.searchParams.set(urlParam, source);
    if (filename) viewerUrl.searchParams.set("filename", filename);
    viewerUrl.searchParams.set("viewer", "2");
    return viewerUrl.toString();
  } catch {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const nameParam = filename ? `&filename=${encodeURIComponent(filename)}` : "";
    return `${baseUrl}${separator}${encodeURIComponent(urlParam)}=${encodeURIComponent(source)}${nameParam}&viewer=2`;
  }
};
