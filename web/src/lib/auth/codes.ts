import "server-only";
import { getStore } from "@/lib/cms/store";
import { rateLimit, retryText } from "@/lib/cms/rateLimit";
import { checkCode, generateCode, hashKey, MAX_ATTEMPTS, newStoredCode, type StoredCode } from "./otp";
import { getSecret, isEditor } from "./secret";
import { sendLoginCode } from "./mail";

export type RequestResult = { ok: true } | { ok: false; error: string };
export type VerifyResult = { ok: true } | { ok: false; error: string; reason: "invalid" | "expired" | "locked" | "missing" | "limited" };

const normEmail = (e: string) => e.trim().toLowerCase();
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** Same answer whether or not the e-mail is an editor's (no account enumeration). */
export async function requestCode(emailRaw: string, ipKey: string): Promise<RequestResult> {
  const email = normEmail(emailRaw);
  if (!isEmail(email)) return { ok: false, error: "Ese correo no parece válido." };
  const secret = getSecret();
  const ip = await rateLimit("codeRequestIp", ipKey);
  if (!ip.allowed) return { ok: false, error: `Demasiados intentos. Probá de nuevo ${retryText(ip.retryAfterMs)}.` };
  const byEmail = await rateLimit("codeRequestEmail", hashKey(`email:${email}`, secret));
  if (!byEmail.allowed) return { ok: false, error: `Ya pediste varios códigos. Probá de nuevo ${retryText(byEmail.retryAfterMs)}.` };

  if (!isEditor(email)) return { ok: true };

  const code = generateCode();
  await getStore().set("authCodes", hashKey(`code:${email}`, secret), { ...newStoredCode(code, email, secret) });
  const when = new Intl.DateTimeFormat("es-CR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Costa_Rica" }).format(new Date());
  try {
    await sendLoginCode(email, code, { when });
  } catch (e) {
    console.error("[cms] no se pudo enviar el código", e);
    return { ok: false, error: "No pudimos enviar el correo. Probá de nuevo en un momento." };
  }
  return { ok: true };
}

export async function verifyCode(emailRaw: string, code: string, ipKey: string): Promise<VerifyResult> {
  const email = normEmail(emailRaw);
  const secret = getSecret();
  const ip = await rateLimit("codeVerifyIp", ipKey);
  if (!ip.allowed) return { ok: false, reason: "limited", error: `Demasiados intentos. Probá de nuevo ${retryText(ip.retryAfterMs)}.` };

  const id = hashKey(`code:${email}`, secret);
  const outcome = (await getStore().update<StoredCode & Record<string, unknown>>("authCodes", id, (cur) => {
    const r = checkCode(cur, code, email, secret);
    if (r === "ok" || r === "expired" || r === "locked") return { next: null, result: r };
    if (r === "invalid" && cur) return { next: { ...cur, attempts: cur.attempts + 1 }, result: cur.attempts + 1 >= MAX_ATTEMPTS ? "locked" : r };
    return { next: undefined, result: r };
  })) as ReturnType<typeof checkCode>;

  switch (outcome) {
    case "ok":
      return { ok: true };
    case "expired":
      return { ok: false, reason: outcome, error: "Ese código ya venció. Pedí uno nuevo." };
    case "locked":
      return { ok: false, reason: outcome, error: "Demasiados intentos con este código. Pedí uno nuevo." };
    case "missing":
      return { ok: false, reason: outcome, error: "No hay un código activo para ese correo. Pedí uno nuevo." };
    default:
      return { ok: false, reason: "invalid", error: "Ese código no es correcto. Revisalo e intentá de nuevo." };
  }
}
