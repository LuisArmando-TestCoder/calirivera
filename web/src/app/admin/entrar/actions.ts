"use server";
import { cookies } from "next/headers";
import { clientKey } from "@/lib/auth/server";
import { requestCode, verifyCode } from "@/lib/auth/codes";
import { adminEmail, getSecret } from "@/lib/auth/secret";
import { cookieOptions, HINT_COOKIE, SESSION_COOKIE, signSession } from "@/lib/auth/session";
import { audit } from "@/lib/cms/audit";

const notConfigured = { ok: false as const, error: "El editor todavía no está configurado (falta SESSION_SECRET). Avisale a Luis." };

function configured(): boolean {
  try {
    getSecret();
    return true;
  } catch {
    return false;
  }
}

export async function requestCodeAction(email: string) {
  if (!configured()) return notConfigured;
  return requestCode(String(email ?? ""), await clientKey());
}

const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/admin");

export async function verifyCodeAction(email: string, code: string, next?: string) {
  if (!configured()) return { ...notConfigured, reason: "missing" as const };
  const r = await verifyCode(String(email ?? ""), String(code ?? ""), await clientKey());
  if (!r.ok) return r;
  const token = await signSession(adminEmail(), getSecret());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions());
  jar.set(HINT_COOKIE, "1", { ...cookieOptions(), httpOnly: false });
  await audit({ actor: adminEmail(), action: "login" });
  return { ok: true as const, redirect: safeNext(next) };
}
