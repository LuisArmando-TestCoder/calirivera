import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { cacheLife, cacheTag } from "next/cache";
import { getAdminDb } from "@/lib/firebase/admin";
import { tagFor } from "@/lib/cache/tags";
import {
  COLLECTIONS,
  type Artwork,
  type CatalogProject,
  type Memory,
  type Collection,
  type CollectionName,
  type Page,
  type Person,
  type Post,
  type Program,
  type ProgramKind,
  type SiteSettings,
} from "./types";

/**
 * Content repository.
 * Source of truth: Firestore (when a service account is configured).
 * Fallback: JSON files in ../content (repo root), produced by the extraction branch,
 * snapshotted into web/.content by scripts/sync-content.mjs:
 *   content/<collection>.json            → array of docs, or
 *   content/<collection>/<slug>.json     → one doc per file
 * Every read is a `use cache` scope tagged per collection, so the CMS can
 * invalidate with updateTag/revalidateTag (see src/lib/cache/server.ts).
 */

// Snapshot of ../content copied by scripts/sync-content.mjs (predev/prebuild).
const CONTENT_DIR = path.join(process.cwd(), ".content");

type Doc = { id: string; slug?: string; status?: string; order?: number };

async function readLocal<T extends Doc>(name: CollectionName): Promise<T[]> {
  const out: T[] = [];
  try {
    const raw = await readFile(path.join(CONTENT_DIR, name + ".json"), "utf8");
    const parsed = JSON.parse(raw);
    out.push(...(Array.isArray(parsed) ? parsed : [parsed]));
  } catch {}
  try {
    const dir = path.join(CONTENT_DIR, name);
    for (const f of await readdir(dir)) {
      if (!f.endsWith(".json")) continue;
      const doc = JSON.parse(await readFile(path.join(dir, f), "utf8"));
      out.push({ id: f.replace(/\.json$/, ""), slug: f.replace(/\.json$/, ""), ...doc });
    }
  } catch {}
  return out;
}

async function readAll<T extends Doc>(name: CollectionName): Promise<T[]> {
  const db = getAdminDb();
  let docs: T[];
  if (db) {
    const snap = await db.collection(name).where("status", "==", "published").get();
    docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<T, "id">) }) as T);
  } else {
    docs = (await readLocal<T>(name)).filter((d) => !d.status || d.status === "published");
  }
  return docs.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
}

async function readOne<T extends Doc>(name: CollectionName, slug: string): Promise<T | null> {
  const all = await readAll<T>(name);
  return all.find((d) => d.slug === slug || d.id === slug) ?? null;
}

// ---------- public API (each is a cached scope) ----------

export async function getSettings(): Promise<SiteSettings> {
  "use cache";
  cacheLife("max");
  cacheTag(tagFor(COLLECTIONS.settings));
  const [s] = await readAll<SiteSettings & Doc>(COLLECTIONS.settings);
  return (
    s ?? {
      id: "site",
      siteName: "Cali Rivera",
      tagline: "El arte es para ser libres.",
      email: "arte@calirivera.com",
      location: "San José, Costa Rica",
      social: [
        { label: "Instagram", href: "https://www.instagram.com/caliriveraartista" },
        { label: "Facebook", href: "https://www.facebook.com/elarteparaserlibres/" },
      ],
      footerNote: "Obra viva y legado artístico desde Costa Rica.",
      contentVersion: "0",
      updatedAt: new Date(0).toISOString(),
    }
  );
}

export async function getPage(slug: string): Promise<Page | null> {
  "use cache";
  cacheLife("max");
  cacheTag(tagFor(COLLECTIONS.pages), tagFor(COLLECTIONS.pages, slug));
  return readOne<Page>(COLLECTIONS.pages, slug);
}

export async function listCollections(): Promise<Collection[]> {
  "use cache";
  cacheLife("max");
  cacheTag(tagFor(COLLECTIONS.collections));
  return readAll<Collection>(COLLECTIONS.collections);
}

export async function getCollection(slug: string): Promise<Collection | null> {
  "use cache";
  cacheLife("max");
  cacheTag(tagFor(COLLECTIONS.collections), tagFor(COLLECTIONS.collections, slug));
  return readOne<Collection>(COLLECTIONS.collections, slug);
}

export async function listArtworks(collectionId?: string): Promise<Artwork[]> {
  "use cache";
  cacheLife("max");
  cacheTag(tagFor(COLLECTIONS.artworks));
  const all = await readAll<Artwork>(COLLECTIONS.artworks);
  return collectionId ? all.filter((a) => a.collectionId === collectionId) : all;
}

export async function getArtwork(slug: string): Promise<Artwork | null> {
  "use cache";
  cacheLife("max");
  cacheTag(tagFor(COLLECTIONS.artworks), tagFor(COLLECTIONS.artworks, slug));
  return readOne<Artwork>(COLLECTIONS.artworks, slug);
}

export async function listCatalogs(): Promise<CatalogProject[]> {
  "use cache";
  cacheLife("max");
  cacheTag(tagFor(COLLECTIONS.catalogs));
  return readAll<CatalogProject>(COLLECTIONS.catalogs);
}

export async function getCatalog(slug: string): Promise<CatalogProject | null> {
  "use cache";
  cacheLife("max");
  cacheTag(tagFor(COLLECTIONS.catalogs), tagFor(COLLECTIONS.catalogs, slug));
  return readOne<CatalogProject>(COLLECTIONS.catalogs, slug);
}

export async function getProgram(kind: ProgramKind): Promise<Program | null> {
  "use cache";
  cacheLife("max");
  cacheTag(tagFor(COLLECTIONS.programs), tagFor(COLLECTIONS.programs, kind));
  const all = await readAll<Program>(COLLECTIONS.programs);
  return all.find((p) => p.kind === kind) ?? null;
}

export async function listPeople(kind?: ProgramKind): Promise<Person[]> {
  "use cache";
  cacheLife("max");
  cacheTag(tagFor(COLLECTIONS.people));
  const all = await readAll<Person>(COLLECTIONS.people);
  return kind ? all.filter((p) => p.programKinds?.includes(kind)) : all;
}

/** Bitácora: newest → oldest. */
export async function listPosts(kind?: ProgramKind): Promise<Post[]> {
  "use cache";
  cacheLife("max");
  cacheTag(tagFor(COLLECTIONS.posts));
  const all = await readAll<Post>(COLLECTIONS.posts);
  return all
    .filter((p) => !kind || p.programKind === kind)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export async function getPost(slug: string): Promise<Post | null> {
  "use cache";
  cacheLife("max");
  cacheTag(tagFor(COLLECTIONS.posts), tagFor(COLLECTIONS.posts, slug));
  return readOne<Post>(COLLECTIONS.posts, slug);
}

/** Slugs for generateStaticParams. */
export async function listSlugs(name: CollectionName): Promise<string[]> {
  "use cache";
  cacheLife("max");
  cacheTag(tagFor(name));
  return (await readAll<Doc>(name)).map((d) => d.slug ?? d.id);
}

// ---------- Memoria ----------
const memYear = (m: Memory) => {
  const y = parseInt(String(m.year ?? ""), 10);
  return Number.isFinite(y) ? y : -1;
};

/** Recuerdos publicados, del más viejo al más nuevo (la línea de tiempo corre 1993 → hoy). */
export async function listMemories(): Promise<Memory[]> {
  "use cache";
  cacheLife("max");
  cacheTag(tagFor(COLLECTIONS.memories));
  const all = await readAll<Memory>(COLLECTIONS.memories);
  return all.sort(
    (a, b) => memYear(a) - memYear(b) || (a.order ?? 1e9) - (b.order ?? 1e9) || String(a.slug).localeCompare(String(b.slug)),
  );
}

export async function getMemory(slug: string): Promise<Memory | null> {
  "use cache";
  cacheLife("max");
  cacheTag(tagFor(COLLECTIONS.memories), tagFor(COLLECTIONS.memories, slug));
  return readOne<Memory>(COLLECTIONS.memories, slug);
}
