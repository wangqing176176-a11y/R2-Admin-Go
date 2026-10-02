const OOXML_EXTENSIONS = new Set(["docx", "xlsx", "pptx"]);
const LEGACY_OFFICE_EXTENSIONS = new Set(["doc", "xls", "ppt"]);

const startsWith = (data: Uint8Array, signature: readonly number[]) =>
  data.length >= signature.length && signature.every((value, index) => data[index] === value);

const isZip = (data: Uint8Array) =>
  startsWith(data, [0x50, 0x4b, 0x03, 0x04]) ||
  startsWith(data, [0x50, 0x4b, 0x05, 0x06]) ||
  startsWith(data, [0x50, 0x4b, 0x07, 0x08]);

const isOleCompoundFile = (data: Uint8Array) =>
  startsWith(data, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export const isPdfFile = (data: Uint8Array) =>
  startsWith(data, [0x25, 0x50, 0x44, 0x46, 0x2d]);

export const getOfficeFileSignatureError = (data: Uint8Array, extension: string) => {
  const ext = extension.trim().toLowerCase().replace(/^\./, "");
  if (!OOXML_EXTENSIONS.has(ext) && !LEGACY_OFFICE_EXTENSIONS.has(ext)) return null;
  if (isPdfFile(data)) {
    return `文件扩展名为 .${ext}，但内容实际是 PDF。为避免损坏原文件，已停止处理。`;
  }
  if (OOXML_EXTENSIONS.has(ext) && !isZip(data)) {
    return `文件内容不是有效的 ${ext.toUpperCase()}（OOXML）格式。为避免损坏原文件，已停止处理。`;
  }
  if (LEGACY_OFFICE_EXTENSIONS.has(ext) && !isOleCompoundFile(data)) {
    return `文件内容不是有效的 ${ext.toUpperCase()} 复合文档格式。为避免损坏原文件，已停止处理。`;
  }
  return null;
};

export const assertOfficeFileSignature = (data: Uint8Array, extension: string) => {
  const message = getOfficeFileSignatureError(data, extension);
  if (message) throw new Error(message);
};
