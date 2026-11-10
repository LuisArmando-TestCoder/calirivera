/** SESSION_SECRET: signs the session cookie and keys every HMAC (codes, IP hashes). */
let warned = false;
const DEV_FALLBACK = "dev-only-secret-change-me-dev-only-secret-change-me";

export function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET falta o es muy corto (mínimo 32 caracteres). Generalo con: npm run cms:secret");
  }
  if (!warned) {
    warned = true;
    console.warn("[cms] SESSION_SECRET no está definido: usando un secreto de desarrollo. NO usar en producción.");
  }
  return DEV_FALLBACK;
}

export function adminEmail(): string {
  return (process.env.ADMIN_EMAIL ?? "arte@calirivera.com").trim().toLowerCase();
}
