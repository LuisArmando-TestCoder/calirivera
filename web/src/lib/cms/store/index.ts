import "server-only";
import { getAdminDb } from "@/lib/firebase/admin";
import { FirestoreStore } from "./firestore";
import { GitHubStore, githubConfigured } from "./github";
import { LocalStore } from "./local";
import type { Store } from "./types";

let store: Store | undefined;

/**
 * Dónde escribe el editor (CMS_STORE=github|firestore|local para forzarlo):
 *  - Firestore si hay service account (instantáneo, necesita el proyecto de Firebase);
 *  - si no, GitHub si hay GITHUB_TOKEN + GITHUB_REPO: el contenido se guarda en el repo y Netlify reconstruye
 *    el sitio (gratis, sin base de datos; el cambio tarda lo que tarda el despliegue);
 *  - si no, archivos locales (solo desarrollo).
 */
export function getStore(): Store {
  if (store) return store;
  const want = process.env.CMS_STORE;
  const db = want && want !== "firestore" ? null : getAdminDb();
  if (db) return (store = new FirestoreStore(db));
  if (want !== "local" && githubConfigured()) return (store = new GitHubStore());
  if (process.env.NODE_ENV === "production" && process.env.CMS_ALLOW_LOCAL_STORE !== "1") {
    console.warn("[cms] Sin service account en producción: el CMS escribe en archivos locales que no persisten.");
  }
  return (store = new LocalStore());
}

/** Agrupa las escrituras de `fn` en una sola publicación (un commit) cuando el almacén es GitHub. */
export async function withBatch<T>(message: string, fn: () => Promise<T>): Promise<{ result: T; commit: string | null; deploys: boolean }> {
  const s = getStore();
  if (s instanceof GitHubStore) return { ...(await s.batch(message, fn)), deploys: true };
  return { result: await fn(), commit: null, deploys: false };
}

export type { Store, AnyDoc } from "./types";
