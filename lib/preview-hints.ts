export type PreviewHintKind =
  | "image"
  | "video"
  | "audio"
  | "local-media"
  | "text"
  | "pdf"
  | "office"
  | "kkfile"
  | "photopea"
  | "cad"
  | "other";

export type PreviewTechSupportHint = {
  prefix: string;
  providerName?: string;
  providerUrl?: string;
  suffix?: string;
};

const BASE_PREVIEW_HINT =
  "在线预览已尽力覆盖主流格式，复杂版式仍可能显示偏差；如需专业编辑或精准排版，请下载后使用专业软件操作。";

const PROVIDER_URLS = {
  artplayer: "https://artplayer.org",
  kkfileview: "https://github.com/kekingcn/kkFileView",
  microsoftOfficeOnline: "https://www.microsoft.com/microsoft-365/free-office-online-for-the-web",
  mlightcad: "https://github.com/mlightcad/cad-viewer",
  photopea: "https://www.photopea.com/",
} as const;

const ARCHIVE_EXTENSIONS = new Set(["7z", "bz2", "gz", "gzip", "jar", "rar", "tar", "tgz", "zip"]);
const IMAGE_EXTENSIONS = new Set(["bmp", "dcm", "emf", "eps", "gif", "heic", "heif", "ico", "jfif", "jpg", "jpeg", "png", "svg", "tga", "tif", "tiff", "webp", "wmf"]);
const KK_DOCUMENT_EXTENSIONS = new Set([
  "bpmn", "docm", "dot", "dotm", "dotx", "dps", "eml", "epub", "et", "ett",
  "fodp", "fods", "fodt", "odp", "ods", "odt", "ofd", "otp", "ots", "ott",
  "pages", "pot", "potm", "potx", "pps", "ppsm", "ppsx", "pptm", "rtf",
  "vsd", "vsdx", "wps", "wpt", "xla", "xlam", "xlsb", "xlsm", "xlt",
  "xltm", "xltx", "xmind",
]);
const KK_CAD_MODEL_EXTENSIONS = new Set([
  "3dm", "3ds", "3mf", "bim", "brep", "cf2", "dae", "dgn", "dwf", "dwfx",
  "fbx", "fcstd", "gltf", "glb", "ifc", "iges", "igs", "obj", "off", "plt",
  "ply", "step", "stl", "stp", "wrl",
]);
const TEXT_EXTENSIONS = new Set([
  "bash", "bat", "c", "cc", "cmd", "conf", "config", "cpp", "cs", "css", "csv",
  "cxx", "env", "go", "h", "hpp", "htm", "html", "ini", "java", "js", "json",
  "jsonl", "jsx", "kt", "less", "log", "markdown", "md", "php", "properties",
  "py", "rb", "rs", "scss", "sh", "sql", "svelte", "swift", "text", "toml",
  "ts", "tsx", "tsv", "txt", "vue", "xml", "yaml", "yml", "zsh",
]);

const getFileExt = (name: string) => {
  const idx = name.lastIndexOf(".");
  if (idx < 0 || idx === name.length - 1) return "";
  return name.slice(idx + 1).toLowerCase();
};

const getProviderHint = (prefix: string, providerName: string, providerUrl: string): PreviewTechSupportHint => ({
  prefix,
  providerName,
  providerUrl,
  suffix: " 提供技术支持。",
});

const getKkFileViewHint = (fileName: string): PreviewTechSupportHint => {
  const ext = getFileExt(fileName);
  const prefix = ARCHIVE_EXTENSIONS.has(ext)
    ? "压缩包文件在线预览由 "
    : IMAGE_EXTENSIONS.has(ext)
      ? "图片文件在线预览由 "
      : KK_CAD_MODEL_EXTENSIONS.has(ext)
        ? "CAD/3D 模型文件在线预览由 "
        : KK_DOCUMENT_EXTENSIONS.has(ext)
          ? "文档文件在线预览由 "
          : TEXT_EXTENSIONS.has(ext)
            ? "文本/代码文件在线预览由 "
            : ext === "drawio"
              ? "图表文件在线预览由 "
              : ext === "pdf"
                ? "PDF 文件在线预览由 "
                : "当前文件在线预览由 ";
  return getProviderHint(prefix, "kkFileView", PROVIDER_URLS.kkfileview);
};

const getPreviewTechSupportHint = (kind: PreviewHintKind, fileName: string) => {
  switch (kind) {
    case "kkfile":
      return getKkFileViewHint(fileName);
    case "cad":
      return getProviderHint("CAD 图纸文件在线预览由 ", "mLightCAD", PROVIDER_URLS.mlightcad);
    case "photopea":
      return getProviderHint("设计文件在线预览由 ", "Photopea", PROVIDER_URLS.photopea);
    case "office":
      return getProviderHint("Office 文档在线预览由 ", "Microsoft Office Online", PROVIDER_URLS.microsoftOfficeOnline);
    case "pdf":
      return { prefix: "PDF 文件在线预览由浏览器内置 PDF 查看器提供技术支持。" };
    case "video":
      return getProviderHint("视频文件在线预览由 ", "ArtPlayer", PROVIDER_URLS.artplayer);
    case "audio":
      return { prefix: "音频文件在线预览由 R2 Admin Go 音频播放器和浏览器音频解码能力提供技术支持。" };
    case "image":
      return { prefix: "图片文件在线预览由浏览器内置图片查看能力提供技术支持。" };
    case "text":
      return { prefix: "文本/代码文件在线预览由 R2 Admin Go 提供技术支持。" };
    case "local-media":
      return { prefix: "此类媒体文件将引导使用本地播放器打开，不提供网页内在线预览。" };
    case "other":
    default:
      return null;
  }
};

export const getPreviewHintParts = (kind: PreviewHintKind, fileName: string) => ({
  base: BASE_PREVIEW_HINT,
  techSupport: getPreviewTechSupportHint(kind, fileName),
});

export const getPreviewHintText = (kind: PreviewHintKind, fileName: string) => {
  const techSupportHint = getPreviewTechSupportHint(kind, fileName);
  if (!techSupportHint) return BASE_PREVIEW_HINT;
  const provider = techSupportHint.providerName ?? "";
  return `${BASE_PREVIEW_HINT}（${techSupportHint.prefix}${provider}${techSupportHint.suffix ?? ""}）`;
};
