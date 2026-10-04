import type { XHRMiddleware } from "./xhr";

const FONT_ROOT = "https://office-editor.ziziyi.com/v9.3.0.24-1/fonts";
const SOURCE_HAN_SERIF_URL = "/siyuansongti.ttc";
const SOURCE_HAN_SERIF_SC_FACE_INDEX = 2;
const ZIZIYI_CJK_FALLBACK_FAMILY = "Droid Sans Fallback";
const ZIZIYI_CJK_FALLBACK_POSTSCRIPT_NAME = "DroidSansFallbackRegular";
export const ZIZIYI_SOURCE_HAN_FONT_PATH = "/ziziyi-local-fonts/source-han-serif-sc-v2/081";

type CommonFontAsset = {
  id?: string;
  localSourceHanSerif?: boolean;
  fileName: string;
};

// The Latin families are already present in ZIZIYI's AllFonts.js. The local
// Source Han collection replaces its existing CJK fallback slot (font 081), so
// x2t conversion/export and editor rendering use the same Simplified Chinese face.
const COMMON_FONT_ASSETS: CommonFontAsset[] = [
  { localSourceHanSerif: true, fileName: "DroidSansFallbackFull.ttc" },
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
let cachedSourceHanSerif: Promise<Uint8Array<ArrayBuffer>> | null = null;
let cachedEncodedSourceHanSerif: Promise<Uint8Array<ArrayBuffer>> | null = null;

const hasTag = (bytes: Uint8Array, offset: number, tag: string) =>
  offset >= 0 && offset + tag.length <= bytes.length && [...tag].every((char, index) => bytes[offset + index] === char.charCodeAt(0));

/**
 * Put the Simplified Chinese face first without rewriting any shared TTC tables.
 * ONLYOFFICE's existing CJK fallback entry opens face 0 of font file 081.
 */
export function prioritizeTtcFace(data: ArrayBuffer | Uint8Array, preferredIndex: number) {
  const source = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!hasTag(source, 0, "ttcf") || source.byteLength < 16) {
    throw new Error("思源宋体文件不是有效的 TTC 字体集合");
  }
  const output = Uint8Array.from(source);
  const view = new DataView(output.buffer);
  const faceCount = view.getUint32(8, false);
  const directoryEnd = 12 + faceCount * 4;
  if (faceCount < 1 || directoryEnd > output.byteLength || preferredIndex < 0 || preferredIndex >= faceCount) {
    throw new Error("思源宋体 TTC 字体目录无效");
  }
  const offsets = Array.from({ length: faceCount }, (_, index) => view.getUint32(12 + index * 4, false));
  for (const offset of offsets) {
    const validSignature = hasTag(output, offset, "OTTO") || hasTag(output, offset, "true") || hasTag(output, offset, "typ1") || (
      offset + 4 <= output.byteLength && view.getUint32(offset, false) === 0x00010000
    );
    if (!validSignature) throw new Error("思源宋体 TTC 包含无效字体面");
  }
  const reordered = [offsets[preferredIndex], ...offsets.filter((_, index) => index !== preferredIndex)];
  reordered.forEach((offset, index) => view.setUint32(12 + index * 4, offset, false));
  return output;
}

const encodeUtf16Be = (value: string) => {
  const bytes = new Uint8Array(value.length * 2);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index * 2] = value.charCodeAt(index) >>> 8;
    bytes[index * 2 + 1] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
};

const rewriteTtcFaceNames = (font: Uint8Array<ArrayBuffer>, faceIndex: number) => {
  const view = new DataView(font.buffer);
  const faceCount = view.getUint32(8, false);
  if (faceIndex < 0 || faceIndex >= faceCount) throw new Error("思源宋体 TTC 字体面无效");
  const faceOffset = view.getUint32(12 + faceIndex * 4, false);
  const tableCount = view.getUint16(faceOffset + 4, false);
  let nameTableRecord = -1;
  for (let index = 0; index < tableCount; index += 1) {
    const recordOffset = faceOffset + 12 + index * 16;
    if (hasTag(font, recordOffset, "name")) {
      nameTableRecord = recordOffset;
      break;
    }
  }
  if (nameTableRecord < 0) throw new Error("思源宋体缺少字体名称表");

  const tableOffset = view.getUint32(nameTableRecord + 8, false);
  const tableLength = view.getUint32(nameTableRecord + 12, false);
  if (tableOffset + tableLength > font.byteLength || tableLength < 6) {
    throw new Error("思源宋体名称表无效");
  }
  const recordCount = view.getUint16(tableOffset + 2, false);
  const stringStorageOffset = tableOffset + view.getUint16(tableOffset + 4, false);
  if (tableOffset + 6 + recordCount * 12 > tableOffset + tableLength) {
    throw new Error("思源宋体名称记录无效");
  }

  let replacedFamily = false;
  let replacedPostScriptName = false;
  for (let index = 0; index < recordCount; index += 1) {
    const recordOffset = tableOffset + 6 + index * 12;
    const platformId = view.getUint16(recordOffset, false);
    const languageId = view.getUint16(recordOffset + 4, false);
    const nameId = view.getUint16(recordOffset + 6, false);
    if (platformId !== 3 || languageId !== 0x0409 || ![1, 4, 6].includes(nameId)) continue;

    const replacement = encodeUtf16Be(
      nameId === 6 ? ZIZIYI_CJK_FALLBACK_POSTSCRIPT_NAME : ZIZIYI_CJK_FALLBACK_FAMILY,
    );
    const recordLength = view.getUint16(recordOffset + 8, false);
    const valueOffset = stringStorageOffset + view.getUint16(recordOffset + 10, false);
    if (replacement.byteLength !== recordLength || valueOffset + recordLength > tableOffset + tableLength) {
      throw new Error("思源宋体名称长度与 ZIZIYI 回退字体不兼容");
    }
    font.set(replacement, valueOffset);
    if (nameId === 6) replacedPostScriptName = true;
    else replacedFamily = true;
  }
  if (!replacedFamily || !replacedPostScriptName) {
    throw new Error("思源宋体缺少可替换的英文字体名称");
  }

  // Keep the OpenType table directory consistent after changing the name bytes.
  let checksum = 0;
  for (let offset = 0; offset < tableLength; offset += 4) {
    let word = 0;
    for (let byteIndex = 0; byteIndex < 4; byteIndex += 1) {
      word = (word << 8) | (offset + byteIndex < tableLength ? font[tableOffset + offset + byteIndex] : 0);
    }
    checksum = (checksum + (word >>> 0)) >>> 0;
  }
  view.setUint32(nameTableRecord + 4, checksum, false);
  return font;
};

/**
 * Make the SC face occupy font 081 and match the family name registered in
 * ZIZIYI's AllFonts.js. Without this name alignment, the engine can load the
 * TTC file but still reject its Chinese glyphs for the fallback slot.
 */
export function prepareSourceHanSerifScFont(data: ArrayBuffer | Uint8Array) {
  return rewriteTtcFaceNames(prioritizeTtcFace(data, SOURCE_HAN_SERIF_SC_FACE_INDEX), 0);
}

const xorZiziyiFontHeader = <T extends ArrayBufferLike>(bytes: Uint8Array<T>): Uint8Array<T> => {
  const headerLength = Math.min(32, bytes.length);
  for (let index = 0; index < headerLength; index += 1) {
    bytes[index] ^= FONT_HEADER_KEY[index % FONT_HEADER_KEY.length];
  }
  return bytes;
};

export function decodeZiziyiFont(data: ArrayBuffer) {
  return xorZiziyiFontHeader(new Uint8Array(data));
}

export function encodeZiziyiFont(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return xorZiziyiFontHeader(copy);
}

function loadSourceHanSerif() {
  if (!cachedSourceHanSerif) {
    cachedSourceHanSerif = (async () => {
      const controller = new AbortController();
      const timeout = globalThis.setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await fetch(SOURCE_HAN_SERIF_URL, { cache: "force-cache", signal: controller.signal });
        if (!response.ok) throw new Error(`思源宋体读取失败（HTTP ${response.status}）`);
        return prepareSourceHanSerifScFont(await response.arrayBuffer());
      } finally {
        globalThis.clearTimeout(timeout);
      }
    })().catch((error) => {
      cachedSourceHanSerif = null;
      throw error;
    });
  }
  return cachedSourceHanSerif;
}

async function fetchFont(asset: CommonFontAsset) {
  if (asset.localSourceHanSerif) {
    return [asset.fileName, await loadSourceHanSerif()] as const;
  }
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${FONT_ROOT}/${asset.id!}`, {
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

/** Serve the local font through the same header-obfuscation contract used by ONLYOFFICE. */
export const createZiziyiFontMiddleware = (): XHRMiddleware => async (request) => {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (url.pathname !== ZIZIYI_SOURCE_HAN_FONT_PATH) return null;
  try {
    if (!cachedEncodedSourceHanSerif) {
      cachedEncodedSourceHanSerif = loadSourceHanSerif().then(encodeZiziyiFont).catch((error) => {
        cachedEncodedSourceHanSerif = null;
        throw error;
      });
    }
    const font = await cachedEncodedSourceHanSerif;
    return new Response(font, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[ZIZIYI] 思源宋体加载失败", error);
    return new Response("Source Han Serif unavailable", { status: 503 });
  }
};
