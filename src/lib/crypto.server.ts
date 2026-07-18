// AES-256-GCM helpers for at-rest encryption of sensitive fields
// (exchange API keys, telegram session strings, platform secrets, etc).
//
// Storage format (string): "v1:<iv_b64>:<tag_b64>:<ciphertext_b64>"

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const FORMAT_VERSION = "v1";

function loadKey(envName: string): Buffer {
  const raw = process.env[envName];
  if (!raw) throw new Error(`${envName} not configured`);
  // Accept either a 32-byte base64 key, or any string — derive a stable
  // 32-byte key via SHA-256 so operators don't need to pre-generate one
  // with a specific length/encoding.
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  return createHash("sha256").update(raw, "utf8").digest();
}

function encryptWith(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${FORMAT_VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

function decryptWith(key: Buffer, payload: string): string {
  // Backward-compat: secrets stored before the v1 envelope rollout were
  // persisted as raw plaintext. If the payload doesn't carry the version
  // prefix, return it as-is so existing accounts keep working.
  if (!payload.startsWith(`${FORMAT_VERSION}:`)) return payload;
  const [, ivB64, tagB64, ctB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("malformed ciphertext payload");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return pt.toString("utf8");
}

export function encryptSecret(plaintext: string): string {
  return encryptWith(loadKey("EXCHANGE_ENCRYPTION_KEY"), plaintext);
}
export function decryptSecret(payload: string): string {
  return decryptWith(loadKey("EXCHANGE_ENCRYPTION_KEY"), payload);
}
export function encryptSession(plaintext: string): string {
  return encryptWith(loadKey("TELEGRAM_SESSION_ENC_KEY"), plaintext);
}
export function decryptSession(payload: string): string {
  return decryptWith(loadKey("TELEGRAM_SESSION_ENC_KEY"), payload);
}

/** Platform-level secrets (payment keys, bot tokens) — separate key when set. */
export function encryptPlatformSecret(plaintext: string): string {
  const keyName = process.env.PLATFORM_SECRETS_KEY ? "PLATFORM_SECRETS_KEY" : "EXCHANGE_ENCRYPTION_KEY";
  return encryptWith(loadKey(keyName), plaintext);
}
export function decryptPlatformSecret(payload: string): string {
  const keyName = process.env.PLATFORM_SECRETS_KEY ? "PLATFORM_SECRETS_KEY" : "EXCHANGE_ENCRYPTION_KEY";
  return decryptWith(loadKey(keyName), payload);
}

export function isEncryptionConfigured(): boolean {
  try {
    loadKey("EXCHANGE_ENCRYPTION_KEY");
    return true;
  } catch {
    return false;
  }
}

export function secretHint(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "****";
  return `…${value.slice(-4)}`;
}
