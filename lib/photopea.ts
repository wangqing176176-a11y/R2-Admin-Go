const DEFAULT_PHOTOPEA_URL = "https://www.photopea.com";

export type PhotopeaTheme = "light" | "dark";

export const isPhotopeaSupported = (extension: string) => /^(psd|psb|ai|raw)$/i.test(String(extension ?? "").trim());

export const buildPhotopeaPreviewUrl = (sourceUrl: string, theme: PhotopeaTheme = "dark") => {
  const baseUrl = String(process.env.NEXT_PUBLIC_PHOTOPEA_URL || DEFAULT_PHOTOPEA_URL)
    .trim()
    .replace(/\/+$/, "");
  const url = String(sourceUrl ?? "").trim();
  if (!baseUrl || !url) return "";
  return `${baseUrl}#${encodeURIComponent(JSON.stringify({
    files: [url],
    environment: { theme: theme === "light" ? 6 : 5 },
  }))}`;
};
