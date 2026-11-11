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

/**
 * Quiénes pueden entrar al editor: Cali (ADMIN_EMAIL) y, si hace falta, otros correos en EDITOR_EMAILS
 * (separados por coma), p. ej. el de Oriens.ninja. Cada quien pide su propio código, que llega solo a su correo.
 */
export function editorEmails(): string[] {
  const extra = (process.env.EDITOR_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  return [...new Set([adminEmail(), ...extra])];
}
export const isEditor = (email: string) => editorEmails().includes(email.trim().toLowerCase());
