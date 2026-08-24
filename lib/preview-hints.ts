import type { PreviewKind } from "@/lib/preview-policy";

export type PreviewHintKind = PreviewKind;

export type PreviewTechSupportHint = {
  prefix: string;
  providerName?: string;
  providerUrl?: string;
  suffix?: string;
};

const BASE_PREVIEW_HINT =
  "系统默认预览仅在当前浏览器内处理文件；启用第三方预览源后，特定格式可能会把文件访问地址或文件内容提供给外部平台。复杂版式仍可能显示偏差。";

const PROVIDER_URLS = {
  artplayer: "https://artplayer.org",
  pdfjs: "https://mozilla.github.io/pdf.js/",
  viewerjs: "https://fengyuanchen.github.io/viewerjs/",
  jszip: "https://stuk.github.io/jszip/",
  online3dviewer: "https://3dviewer.net/",
  xmind: "https://www.xmind.cn/embed-viewer/",
  microsoftOfficeOnline: "https://www.microsoft.com/microsoft-365/free-office-online-for-the-web",
  mlightcad: "https://github.com/mlightcad/cad-viewer",
  photopea: "https://www.photopea.com/",
} as const;

const provider = (prefix: string, providerName: string, providerUrl: string, suffix: string): PreviewTechSupportHint => ({
  prefix,
  providerName,
  providerUrl,
  suffix,
});

const getPreviewTechSupportHint = (kind: PreviewHintKind): PreviewTechSupportHint | null => {
  switch (kind) {
    case "pdf":
      return provider("PDF 由 ", "Mozilla PDF.js", PROVIDER_URLS.pdfjs, " 在当前浏览器内解析，文件不会提交给第三方预览平台。");
    case "image":
      return provider("图片由浏览器与 ", "Viewer.js", PROVIDER_URLS.viewerjs, " 在本地显示，文件不会提交给第三方预览平台。");
    case "archive":
      return provider("ZIP 目录由 ", "JSZip", PROVIDER_URLS.jszip, " 在当前浏览器内解包读取；不会上传到预览平台，目前仅支持 ZIP。");
    case "model":
      return provider("3D 模型由 ", "Online 3D Viewer", PROVIDER_URLS.online3dviewer, " 在当前浏览器内解析；不会上传到预览平台。");
    case "cad":
      return provider("CAD 图纸由 ", "mLightCAD", PROVIDER_URLS.mlightcad, " 在当前浏览器内解析；不会上传到预览平台。");
    case "office":
      return provider("第三方预览源：", "Microsoft Office Online", PROVIDER_URLS.microsoftOfficeOnline, "。文件访问地址会提供给 Microsoft，涉密文件请切换为“系统默认”。");
    case "photopea":
      return provider("第三方预览源：", "Photopea", PROVIDER_URLS.photopea, "。文件会由 Photopea 网页加载处理，涉密文件请切换为“系统默认”。");
    case "xmind":
      return provider("第三方预览源：", "XMind Embed Viewer", PROVIDER_URLS.xmind, "。文件内容会传入 XMind 托管的预览页面，涉密文件请切换为“系统默认”。");
    case "video":
      return provider("视频由 ", "ArtPlayer", PROVIDER_URLS.artplayer, " 与浏览器媒体能力在本地播放。");
    case "audio":
      return { prefix: "音频由 R2 Admin Go 播放器和浏览器解码能力在本地播放。" };
    case "text":
      return { prefix: "文本/代码由 R2 Admin Go 在当前浏览器内读取显示。" };
    case "local-media":
      return { prefix: "此媒体格式将引导使用本地播放器打开，不提供网页内在线预览。" };
    case "other":
    default:
      return { prefix: "当前预览源不支持此格式。系统默认模式不会为兼容格式而把文件交给第三方平台。" };
  }
};

export const getPreviewHintParts = (kind: PreviewHintKind, _fileName: string) => ({
  base: BASE_PREVIEW_HINT,
  techSupport: getPreviewTechSupportHint(kind),
});

export const getPreviewHintText = (kind: PreviewHintKind, fileName: string) => {
  const hint = getPreviewHintParts(kind, fileName);
  const support = hint.techSupport;
  if (!support) return hint.base;
  return `${hint.base}（${support.prefix}${support.providerName ?? ""}${support.suffix ?? ""}）`;
};
