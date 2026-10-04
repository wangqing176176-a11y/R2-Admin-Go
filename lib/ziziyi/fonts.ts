const FONT_ROOT = "https://office-editor.ziziyi.com/v9.3.0.24-1/fonts";

type CommonFontAsset = {
  id: string;
  fileName: string;
};

// These open-source families are already present in ZIZIYI's AllFonts.js.
// Supplying the matching files to x2t keeps browser conversion/export aligned
// with the fonts offered by the editor without bundling proprietary fonts.
const COMMON_FONT_ASSETS: CommonFontAsset[] = [
  { id: "081", fileName: "DroidSansFallbackFull.ttf" },
  { id: "063", fileName: "Carlito-Regular.ttf" },
  { id: "062", fileName: "Carlito-Bold.ttf" },
  { id: "060", fileName: "Carlito-Italic.ttf" },
  { id: "061", fileName: "Carlito-BoldItalic.ttf" },
  { id: "012", fileName: "LiberationSans-Regular.ttf" },
  { id: "011", fileName: "LiberationSans-Bold.ttf" },
  { id: "009", fileName: "LiberationSans-Italic.ttf" },
  { id: "010", fileName: "LiberationSans-BoldItalic.ttf" },
  { id: "020", fileName: "LiberationSerif-Regular.ttf" },
  { id: "019", fileName: "LiberationSerif-Bold.ttf" },
  { id: "017", fileName: "LiberationSerif-Italic.ttf" },
  { id: "018", fileName: "LiberationSerif-BoldItalic.ttf" },
];

// ONLYOFFICE obscures the first 32 bytes of web-delivered font files with
// this repeating key. x2t needs the original TTF bytes instead.
const FONT_HEADER_KEY = new Uint8Array([
  0xa0, 0x66, 0xd6, 0x20, 0x14, 0x96, 0x47, 0xfa,
  0x95, 0x69, 0xb8, 0x50, 0xb0, 0x41, 0x49, 0x48,
]);

let cachedFonts: Promise<Record<string, Uint8Array>> | null = null;

export function decodeZiziyiFont(data: ArrayBuffer) {
  const bytes = new Uint8Array(data);
  const headerLength = Math.min(32, bytes.length);
  for (let index = 0; index < headerLength; index += 1) {
    bytes[index] ^= FONT_HEADER_KEY[index % FONT_HEADER_KEY.length];
  }
  return bytes;
}

async function fetchFont(asset: CommonFontAsset) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${FONT_ROOT}/${asset.id}`, {
      cache: "force-cache",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${asset.fileName} 下载失败（HTTP ${response.status}）`);
    }
    return [asset.fileName, decodeZiziyiFont(await response.arrayBuffer())] as const;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function loadCommonZiziyiFonts() {
  if (!cachedFonts) {
    cachedFonts = Promise.allSettled(COMMON_FONT_ASSETS.map(fetchFont)).then((results) => {
      const fonts: Record<string, Uint8Array> = {};
      const failures: unknown[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          fonts[result.value[0]] = result.value[1];
        } else {
          failures.push(result.reason);
        }
      }
      if (failures.length > 0) {
        console.warn(`[ZIZIYI] ${failures.length} 个常用字体加载失败`, failures);
      }
      if (Object.keys(fonts).length === 0) cachedFonts = null;
      return fonts;
    });
  }
  return cachedFonts;
}
