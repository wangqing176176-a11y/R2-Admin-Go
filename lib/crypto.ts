import { requireEnvString, getEnvString } from "@/lib/env";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (bytes: Uint8Array) => {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

const fromBase64 = (base64: string) => {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(base64, "base64"));
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export const b64urlEncode = (bytes: Uint8Array) =>
  toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

export const b64urlDecode = (input: string) => {
  const b64 = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4 || 4)) % 4);
  return fromBase64(padded);
};

const deriveAesKey = async (secret: string, purpose: string) => {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(`${purpose}:${secret}`));
  return await crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
};

const encryptText = async (secret: string, purpose: string, plainText: string) => {
  const key = await deriveAesKey(secret, purpose);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plainText));
  return `v1.${b64urlEncode(iv)}.${b64urlEncode(new Uint8Array(cipher))}`;
};

const decryptText = async (secret: string, purpose: string, sealed: string) => {
  const [version, ivB64, dataB64] = sealed.split(".", 3);
  if (version !== "v1" || !ivB64 || !dataB64) throw new Error("Invalid encrypted value");
  const key = await deriveAesKey(secret, purpose);
  const iv = b64urlDecode(ivB64);
  const data = b64urlDecode(dataB64);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return decoder.decode(new Uint8Array(plain));
};

const getCredentialSecret = () => requireEnvString("CREDENTIALS_ENCRYPTION_KEY");

const getRouteTokenSecret = () => {
  const secret = getEnvString("ROUTE_TOKEN_SECRET", "ACCESS_TOKEN_SECRET", "CREDENTIALS_ENCRYPTION_KEY");
  if (!secret) throw new Error("Missing environment variable: ROUTE_TOKEN_SECRET or CREDENTIALS_ENCRYPTION_KEY");
  return secret;
};

export const encryptCredential = async (plainText: string) => {
  return await encryptText(getCredentialSecret(), "bucket-credential", plainText);
};

export const decryptCredential = async (sealed: string) => {
  if (!sealed) return "";
  if (!sealed.startsWith("v1.")) return sealed;
  return await decryptText(getCredentialSecret(), "bucket-credential", sealed);
};

export const issueSealedPayload = async (payload: unknown, expiresInSeconds = 900) => {
  const exp = Math.floor(Date.now() / 1000) + Math.max(30, Math.min(24 * 3600, expiresInSeconds));
  const wrapped = JSON.stringify({ exp, payload });
  return await encryptText(getRouteTokenSecret(), "route-token", wrapped);
};

export const readSealedPayload = async <T>(token: string): Promise<T> => {
  const raw = await decryptText(getRouteTokenSecret(), "route-token", token);
  const parsed = JSON.parse(raw) as { exp?: number; payload?: unknown };
  const exp = Number(parsed.exp ?? NaN);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }
  return parsed.payload as T;
};
