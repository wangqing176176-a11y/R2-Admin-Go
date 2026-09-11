import { b64urlDecode, b64urlEncode } from "@/lib/crypto";
import { verifyPasscodeHash } from "@/lib/share-security";
const encoder = new TextEncoder();
const HASH_PREFIX = "pbkdf2-sha256:120000:";
export const validateFolderPassword = (password: string) => {
  if (password.length < 8 || password.length > 128) throw Object.assign(new Error("访问密码需为 8–128 位"), { status: 400 });
};
export const hashFolderPassword = async (password: string, salt: string) => {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(b64urlDecode(salt)), iterations: 120_000 }, key, 256);
  return `${HASH_PREFIX}${b64urlEncode(new Uint8Array(bits))}`;
};
export const verifyFolderPassword = async (password: string, salt: string, hash: string) => {
  if (!hash.startsWith(HASH_PREFIX)) return verifyPasscodeHash(password, salt, hash);
  const actual = await hashFolderPassword(password, salt);
  if (actual.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ actual.charCodeAt(i);
  return diff === 0;
};
