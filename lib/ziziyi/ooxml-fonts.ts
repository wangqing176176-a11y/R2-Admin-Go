import JSZip from "jszip";

export const SOURCE_HAN_SERIF_SC_FAMILY = "思源宋体";

const OOXML_FILE_TYPES = new Set([
  "docx", "docm", "dotx", "dotm",
  "xlsx", "xlsm", "xltx", "xltm",
  "pptx", "pptm", "ppsx", "ppsm", "potx", "potm",
]);

const XML_PART_ROOTS = ["word/", "xl/", "ppt/"];
const HAN_CHARACTER = /[\u3400-\u9fff]/u;
const FONT_ATTRIBUTE = /((?:\b(?:w:)?(?:ascii|hAnsi|eastAsia|cs)|\btypeface|\bfont-family)\s*=\s*)(["'])([^"']*)\2/giu;
const FONT_ELEMENT_NAME_ATTRIBUTE = /(<(?:[\w-]+:)?font\b[^>]*?\b(?:[\w-]+:)?name\s*=\s*)(["'])([^"']*)\2/giu;
const RUN_FONT_VALUE_ATTRIBUTE = /(<(?:[\w-]+:)?rFont\b[^>]*?\b(?:[\w-]+:)?val\s*=\s*)(["'])([^"']*)\2/giu;
const EXCEL_FONT_BLOCK = /<(?:[\w-]+:)?font\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?font>/giu;
const EXCEL_FONT_NAME_VALUE = /(<(?:[\w-]+:)?name\b[^>]*?\b(?:[\w-]+:)?val\s*=\s*)(["'])([^"']*)\2/giu;

const CHINESE_FONT_ALIASES = new Set([
  "simsun",
  "nsimsun",
  "fangsong",
  "fangsonggb2312",
  "simhei",
  "kaiti",
  "kaitigb2312",
  "microsoftyahei",
  "dengxian",
  "stsong",
  "stfangsong",
  "stkaiti",
  "stzhongsong",
  "songtisc",
  "sourcehanserifsc",
  "notoserifcjksc",
  "pingfangsc",
]);

const normalizeAlias = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, "");
const isChineseFont = (value: string) => HAN_CHARACTER.test(value) || CHINESE_FONT_ALIASES.has(normalizeAlias(value));

const replaceMatch = (_match: string, prefix: string, quote: string, value: string) =>
  isChineseFont(value) ? `${prefix}${quote}${SOURCE_HAN_SERIF_SC_FAMILY}${quote}` : `${prefix}${quote}${value}${quote}`;

export function replaceChineseFontDeclarations(xml: string) {
  let output = xml.replace(FONT_ATTRIBUTE, replaceMatch);
  output = output.replace(FONT_ELEMENT_NAME_ATTRIBUTE, replaceMatch);
  output = output.replace(RUN_FONT_VALUE_ATTRIBUTE, replaceMatch);
  output = output.replace(EXCEL_FONT_BLOCK, (block) => block.replace(EXCEL_FONT_NAME_VALUE, replaceMatch));
  return output;
}

/**
 * Normalize font declarations in a temporary OOXML copy before x2t reads it.
 * The original object remains untouched until the user explicitly saves.
 */
export async function normalizeOoxmlChineseFonts(data: ArrayBuffer, fileType: string) {
  if (!OOXML_FILE_TYPES.has(fileType.toLowerCase())) return data;

  const archive = await JSZip.loadAsync(data);
  let changed = false;
  for (const entry of Object.values(archive.files)) {
    if (
      entry.dir ||
      !entry.name.toLowerCase().endsWith(".xml") ||
      !XML_PART_ROOTS.some((root) => entry.name.toLowerCase().startsWith(root))
    ) continue;
    const source = await entry.async("string");
    const normalized = replaceChineseFontDeclarations(source);
    if (normalized === source) continue;
    archive.file(entry.name, normalized);
    changed = true;
  }

  if (!changed) return data;
  return archive.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
