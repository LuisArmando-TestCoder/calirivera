/** One-time login codes: CSPRNG, HMAC-SHA256 hashed, constant-time compare. */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const CODE_TTL_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 5;

export interface StoredCode {
  codeHash: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
}

export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashCode(code: string, email: string, secret: string): string {
  return createHmac("sha256", secret).update(`${email.toLowerCase()}:${code}`).digest("hex");
}

export function hashKey(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex").slice(0, 40);
}

export function newStoredCode(code: string, email: string, secret: string, now = Date.now()): StoredCode {
  return { codeHash: hashCode(code, email, secret), expiresAt: now + CODE_TTL_MS, attempts: 0, createdAt: now };
}

export type VerifyOutcome = "ok" | "invalid" | "expired" | "locked" | "missing";

/** Pure check. Caller persists `attempts + 1` on "invalid" and deletes the code on "ok". */
export function checkCode(stored: StoredCode | null, code: string, email: string, secret: string, now = Date.now()): VerifyOutcome {
  if (!stored) return "missing";
  if (stored.expiresAt <= now) return "expired";
  if (stored.attempts >= MAX_ATTEMPTS) return "locked";
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) return "invalid";
  const a = Buffer.from(hashCode(clean, email, secret), "hex");
  const b = Buffer.from(stored.codeHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "invalid";
}
