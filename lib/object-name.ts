const PORTABLE_FORBIDDEN_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f\u007f]/;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i;
const MAX_PORTABLE_NAME_BYTES = 255;

export const getPortableObjectNameError = (rawName: string): string | null => {
  const name = String(rawName ?? "");
  if (!name) return "名称不能为空";
  if (name === "." || name === "..") return "名称不能为 . 或 ..";
  if (PORTABLE_FORBIDDEN_CHARACTERS.test(name)) {
    return '名称不能包含以下字符：< > : " / \\ | ? *';
  }
  if (/[. ]$/.test(name)) return "名称不能以句点或空格结尾";
  if (WINDOWS_RESERVED_NAME.test(name)) return "名称不能使用 Windows 保留设备名";
  if (new TextEncoder().encode(name).byteLength > MAX_PORTABLE_NAME_BYTES) {
    return `名称的 UTF-8 长度不能超过 ${MAX_PORTABLE_NAME_BYTES} 字节`;
  }
  return null;
};
