import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { editorEmails, getSecret } from "./secret";
import { hashKey } from "./otp";
import { HINT_COOKIE, SESSION_COOKIE, verifySession, type Session } from "./session";

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifySession(token, getSecret(), editorEmails());
  } catch {
    return null;
  }
}

/** Use at the top of every admin page / action. Redirects to the login screen. */
export async function requireAdmin(next?: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/admin/entrar${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return s;
}

/** For server actions that must not redirect: throws instead. */
export async function assertAdmin(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("No autorizado. Volvé a entrar.");
  return s;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-nf-client-connection-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

export async function clientKey(): Promise<string> {
  let secret = "unconfigured";
  try {
    secret = getSecret();
  } catch {}
  return hashKey(`ip:${await clientIp()}`, secret);
}

export { SESSION_COOKIE, HINT_COOKIE };
