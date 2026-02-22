export type FileIconKind = "file" | "folder";

const IMAGE_FILE_RE = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff)$/i;
const VIDEO_FILE_RE = /\.(mp4|webm|ogg|mov|mkv|avi|m4v)$/i;
const AUDIO_FILE_RE = /\.(mp3|wav|ogg|m4a|flac|aac|wma)$/i;
const SHEET_FILE_RE = /\.(xlsx|xls|csv)$/i;
const PPT_FILE_RE = /\.(pptx|ppt)$/i;
const DOC_FILE_RE = /\.(docx|doc)$/i;
const ARCHIVE_FILE_RE = /\.(zip|rar|7z|tar|gz|bz2|xz)$/i;
const CODE_FILE_RE = /\.(html|css|js|jsx|ts|tsx|json|java|py|go|c|cpp|h|cs|php|rb|sh|bat|cmd|xml|yaml|yml|sql|rs|swift|kt)$/i;
const TEXT_FILE_RE = /\.(txt|md|markdown|log|ini|conf)$/i;

const CAD_EXT_RE = /^(dwg|dxf|dwt|dwf|step|stp|iges|igs|ifc)$/i;
const EXE_EXT_RE = /^(exe|msi|com|scr)$/i;
const APK_EXT_RE = /^(apk|xapk|apks|aab)$/i;
const APP_INSTALL_EXT_RE = /^(dmg|pkg|deb|rpm|appimage)$/i;

const ICONS = {
  folder: "/file-icons/文件夹.svg",
  image: "/file-icons/图片-jpg_png.svg",
  video: "/file-icons/视频-mov_mp4_avi.svg",
  audio: "/file-icons/音乐-mp3_wav.svg",
  pdf: "/file-icons/pdf.svg",
  sheet: "/file-icons/表格-xlxs_xls.svg",
  ppt: "/file-icons/演示文档-ppt_pptx.svg",
  doc: "/file-icons/文档-docx_doc.svg",
  archive: "/file-icons/压缩文件-zip_rar_7z.svg",
  code: "/file-icons/编码文件-css_bat.svg",
  text: "/file-icons/文本文档-txt.svg",
  cad: "/file-icons/CAD.svg",
  exe: "/file-icons/可执行文件-exe.svg",
  apk: "/file-icons/apk.svg",
  appleInstall: "/file-icons/苹果安装文件-ipa_dmg.svg",
  psd: "/file-icons/PSD.svg",
  other: "/file-icons/其他.svg",
} as const;

const getFileExt = (name: string) => {
  const idx = name.lastIndexOf(".");
  if (idx < 0 || idx === name.length - 1) return "";
  return name.slice(idx + 1).toLowerCase();
};

export const getFileIconSrc = (type: string, name: string) => {
  if (type === "folder") return ICONS.folder;

  const fileName = String(name ?? "");
  const lowerName = fileName.toLowerCase();
  const ext = getFileExt(fileName);

  if (IMAGE_FILE_RE.test(lowerName)) return ICONS.image;
  if (VIDEO_FILE_RE.test(lowerName)) return ICONS.video;
  if (AUDIO_FILE_RE.test(lowerName)) return ICONS.audio;
  if (lowerName.endsWith(".pdf")) return ICONS.pdf;
  if (SHEET_FILE_RE.test(lowerName)) return ICONS.sheet;
  if (PPT_FILE_RE.test(lowerName)) return ICONS.ppt;
  if (DOC_FILE_RE.test(lowerName)) return ICONS.doc;
  if (ext === "psd") return ICONS.psd;
  if (CAD_EXT_RE.test(ext)) return ICONS.cad;
  if (EXE_EXT_RE.test(ext)) return ICONS.exe;
  if (APK_EXT_RE.test(ext)) return ICONS.apk;
  if (ext === "ipa" || APP_INSTALL_EXT_RE.test(ext)) return ICONS.appleInstall;
  if (ARCHIVE_FILE_RE.test(lowerName)) return ICONS.archive;
  if (CODE_FILE_RE.test(lowerName)) return ICONS.code;
  if (TEXT_FILE_RE.test(lowerName)) return ICONS.text;
  return ICONS.other;
};
