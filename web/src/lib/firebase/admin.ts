import "server-only";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Credentials, in order:
 *  1. env FIREBASE_SERVICE_ACCOUNT (raw JSON or base64 JSON) — Netlify
 *  2. .secrets/service-account.json — local dev (git-ignored)
 * Returns null when none is available so callers can fall back to local JSON.
 */
function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(json) as ServiceAccount;
  }
  const file = path.join(process.cwd(), ".secrets", "service-account.json");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as ServiceAccount;
  return null;
}

let app: App | null | undefined;

export function getAdminApp(): App | null {
  if (app !== undefined) return app;
  const existing = getApps()[0];
  if (existing) return (app = existing);
  const sa = loadServiceAccount();
  app = sa ? initializeApp({ credential: cert(sa) }) : null;
  return app;
}

export function getAdminDb(): Firestore | null {
  const a = getAdminApp();
  return a ? getFirestore(a) : null;
}

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "arte@calirivera.com").toLowerCase();
