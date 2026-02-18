import { b64urlDecode, b64urlEncode } from "@/lib/crypto";
import { getEnvString } from "@/lib/env";

const encoder = new TextEncoder();

const PASSCODE_MIN = 4;
const PASSCODE_MAX = 16;
const PASSCODE_RE = /^[A-Za-z0-9]+$/;

const SHARE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz";

const constantTimeEquals = (a: string, b: string) => {
  const aa = encoder.encode(a);
  const bb = encoder.encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) {
    diff |= aa[i] ^ bb[i];
  }
  return diff === 0;
};

const getPasscodePepper = () => getEnvString("ROUTE_TOKEN_SECRET", "CREDENTIALS_ENCRYPTION_KEY");

export const normalizeShareCode = (raw: string) => String(raw ?? "").trim();

export const createShareCode = (length = 10) => {
  const size = Math.max(6, Math.min(20, Math.floor(length)));
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let out = "";
  for (let i = 0; i < size; i += 1) {
    out += SHARE_CODE_ALPHABET[bytes[i] % SHARE_CODE_ALPHABET.length];
  }
  return out;
};

const toHalfWidthAlphaNum = (input: string) =>
  input.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));

export const normalizePasscode = (raw: string) => toHalfWidthAlphaNum(String(raw ?? "").replace(/\u3000/g, " ")).trim();

export const validatePasscode = (raw: string) => {
  const passcode = normalizePasscode(raw);
  if (!passcode) return { ok: false, message: "请输入提取码" } as const;
  if (passcode.length < PASSCODE_MIN || passcode.length > PASSCODE_MAX) {
    return { ok: false, message: `提取码长度需为 ${PASSCODE_MIN}-${PASSCODE_MAX} 位` } as const;
  }
  if (!PASSCODE_RE.test(passcode)) {
    return { ok: false, message: "提取码仅支持字母与数字" } as const;
  }
  return { ok: true, passcode } as const;
};

export const createPasscodeSalt = () => b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));

export const hashPasscode = async (passcode: string, salt: string) => {
  const normalized = normalizePasscode(passcode);
  const saltBytes = b64urlDecode(salt);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${normalized}::${getPasscodePepper()}`),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBytes,
      iterations: 120_000,
    },
    keyMaterial,
    256,
  );
  return b64urlEncode(new Uint8Array(bits));
};

export const verifyPasscodeHash = async (passcode: string, salt: string, hash: string) => {
  const nextHash = await hashPasscode(passcode, salt);
  return constantTimeEquals(nextHash, String(hash ?? ""));
};
