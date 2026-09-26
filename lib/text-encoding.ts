export type TextFileEncoding = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be";
export type TextLineEnding = "lf" | "crlf";

export const TEXT_ENCODING_OPTIONS: Array<{ value: TextFileEncoding; label: string }> = [
  { value: "utf-8", label: "UTF-8" },
  { value: "utf-8-bom", label: "UTF-8 BOM" },
  { value: "utf-16le", label: "UTF-16 LE" },
  { value: "utf-16be", label: "UTF-16 BE" },
];

export const normalizeLineEndings = (value: string, lineEnding: TextLineEnding) => {
  const normalized = value.replace(/\r\n?/g, "\n");
  return lineEnding === "crlf" ? normalized.replace(/\n/g, "\r\n") : normalized;
};

export const detectLineEnding = (value: string): TextLineEnding => /\r\n/.test(value) ? "crlf" : "lf";

const concatBytes = (prefix: number[], bytes: Uint8Array) => {
  const result = new Uint8Array(prefix.length + bytes.length);
  result.set(prefix, 0);
  result.set(bytes, prefix.length);
  return result;
};

export const encodeTextFile = (value: string, encoding: TextFileEncoding, lineEnding: TextLineEnding) => {
  const normalized = normalizeLineEndings(value, lineEnding);
  if (encoding === "utf-8") return new TextEncoder().encode(normalized);
  if (encoding === "utf-8-bom") return concatBytes([0xef, 0xbb, 0xbf], new TextEncoder().encode(normalized));

  const bytes = new Uint8Array(2 + normalized.length * 2);
  const littleEndian = encoding === "utf-16le";
  bytes[0] = littleEndian ? 0xff : 0xfe;
  bytes[1] = littleEndian ? 0xfe : 0xff;
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    const offset = 2 + index * 2;
    bytes[offset] = littleEndian ? code & 0xff : code >> 8;
    bytes[offset + 1] = littleEndian ? code >> 8 : code & 0xff;
  }
  return bytes;
};

export const decodeTextFile = (bytes: Uint8Array): { text: string; encoding: TextFileEncoding; lineEnding: TextLineEnding } => {
  let encoding: TextFileEncoding = "utf-8";
  let offset = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    encoding = "utf-8-bom";
    offset = 3;
  } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = "utf-16le";
    offset = 2;
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = "utf-16be";
    offset = 2;
  } else {
    const sampleLength = Math.min(bytes.length - (bytes.length % 2), 512);
    let evenZeroes = 0;
    let oddZeroes = 0;
    for (let index = 0; index < sampleLength; index += 2) {
      if (bytes[index] === 0) evenZeroes += 1;
      if (bytes[index + 1] === 0) oddZeroes += 1;
    }
    const pairs = Math.max(1, sampleLength / 2);
    if (oddZeroes / pairs > 0.3) encoding = "utf-16le";
    else if (evenZeroes / pairs > 0.3) encoding = "utf-16be";
  }

  const decoderLabel = encoding === "utf-16le" ? "utf-16le" : encoding === "utf-16be" ? "utf-16be" : "utf-8";
  const text = new TextDecoder(decoderLabel).decode(bytes.subarray(offset));
  return { text, encoding, lineEnding: detectLineEnding(text) };
};
