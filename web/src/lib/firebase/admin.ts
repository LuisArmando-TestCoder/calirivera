import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";
import { loadServiceAccount } from "./credentials.mjs";

/**
 * Credenciales (ver credentials.mjs): env FIREBASE_SERVICE_ACCOUNT, o las 3 variables
 * FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY (Netlify), o service-account.json en la raíz
 * del repo (git-ignored). Sin credenciales devuelve null y el sitio cae al JSON local.
 *
 * Ojo: no importar `firebase-admin/auth`. Arrastra jwks-rsa → jose (ESM), que el Node de las funciones de
 * Netlify no puede cargar con require(): tumbaba TODA página dinámica (editor, entrar, API) con ERR_REQUIRE_ESM.
 */
let app: App | null | undefined;

export function getAdminApp(): App | null {
  if (app !== undefined) return app;
  const existing = getApps()[0];
  if (existing) return (app = existing);
  const sa = loadServiceAccount();
  if (!sa) return (app = null);
  const { credentials } = sa;
  app = initializeApp({
    credential: cert(credentials),
    projectId: credentials.projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${credentials.projectId}.firebasestorage.app`,
  });
  return app;
}

export function getAdminDb(): Firestore | null {
  const a = getAdminApp();
  return a ? getFirestore(a) : null;
}

export function getAdminStorage(): Storage | null {
  const a = getAdminApp();
  return a ? getStorage(a) : null;
}

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "arte@calirivera.com").toLowerCase();
