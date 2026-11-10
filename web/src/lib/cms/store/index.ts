import "server-only";
import { getAdminDb } from "@/lib/firebase/admin";
import { FirestoreStore } from "./firestore";
import { LocalStore } from "./local";
import type { Store } from "./types";

let store: Store | undefined;

/** Firestore when a service account is configured, otherwise local JSON (dev only). */
export function getStore(): Store {
  if (store) return store;
  const db = getAdminDb();
  if (db) return (store = new FirestoreStore(db));
  if (process.env.NODE_ENV === "production" && process.env.CMS_ALLOW_LOCAL_STORE !== "1") {
    console.warn("[cms] Sin service account en producción: el CMS escribe en archivos locales que no persisten.");
  }
  return (store = new LocalStore());
}

export type { Store, AnyDoc } from "./types";
