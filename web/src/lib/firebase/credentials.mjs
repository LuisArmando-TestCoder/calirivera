// Shared by the Next.js server (admin.ts) and the CLI scripts (scripts/firebase-*.mjs).
// Order:
//  1. FIREBASE_SERVICE_ACCOUNT  — raw JSON or base64 JSON
//  2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY — Netlify (fits the 4 KB function env limit)
//  3. service-account.json in the repo root (../ from web/) or in web/ — local, git-ignored
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const SERVICE_ACCOUNT_FILENAME = "service-account.json";

export function serviceAccountCandidates(cwd = process.cwd()) {
  return [path.resolve(cwd, "..", SERVICE_ACCOUNT_FILENAME), path.resolve(cwd, SERVICE_ACCOUNT_FILENAME)];
}

function normalize(sa) {
  const projectId = sa.projectId ?? sa.project_id;
  const clientEmail = sa.clientEmail ?? sa.client_email;
  const privateKey = (sa.privateKey ?? sa.private_key ?? "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

/** @returns {{ credentials: {projectId:string,clientEmail:string,privateKey:string}, source: string } | null} */
export function loadServiceAccount(cwd = process.cwd()) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (raw) {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const c = normalize(JSON.parse(json));
    if (c) return { credentials: c, source: "env FIREBASE_SERVICE_ACCOUNT" };
  }
  if (process.env.FIREBASE_PRIVATE_KEY) {
    const c = normalize({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY,
    });
    if (c) return { credentials: c, source: "env FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY" };
  }
  for (const file of serviceAccountCandidates(cwd)) {
    if (existsSync(/*turbopackIgnore: true*/ file)) {
      const c = normalize(JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, "utf8")));
      if (c) return { credentials: c, source: file };
    }
  }
  return null;
}
