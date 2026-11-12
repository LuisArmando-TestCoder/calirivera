import "server-only";
import { cacheLife } from "next/cache";
import { adminEmail } from "@/lib/auth/secret";
import { getAudit, listAudit } from "../audit";
import { COLLECTION_DEFS, isContentCollection, type ContentCollection } from "../config";
import { getStore } from "../store";
import { restoreDocs, revertAudit, titleOf } from "../write";
import { diffDocs, summarize, type Change } from "./diff";

/**
 * Versiones: cada publicación queda guardada y se puede volver a ella.
 *
 *  - Con el sitio guardado en GitHub, la historia ES el historial del repositorio (cada «Publicar» es un
 *    commit): no ocupa nada extra, no se puede perder, y una versión vieja nunca cambia (se guarda en caché
 *    para siempre después de la primera vez que se mira).
 *  - En desarrollo (archivos locales) sale del registro de cambios del editor.
 *
 * Volver a una versión nunca borra nada: escribe una versión NUEVA igual a la elegida. Lo que había antes
 * también queda en el historial, así que cualquier vuelta atrás se puede deshacer.
 */

export type VersionDoc = {
  collection: ContentCollection;
  id: string;
  title: string;
  /** qué tipo de cosa es («Página», «Obra»…) */
  kind: string;
  state: "changed" | "added" | "removed";
  changes: Change[];
  summary: string;
  /** cambios que no se muestran (hay más de los que caben) */
  more: number;
};
export type Version = {
  id: string;
  at: string;
  who: string;
  /** publicado desde el editor, o un cambio técnico (código, importaciones) */
  by: "editor" | "code";
  docs: VersionDoc[];
  /** documentos tocados que no se detallan (cambios técnicos enormes) */
  moreDocs: number;
};
export type Scope = { collection: string; id: string } | null;

const MAX_DOCS = 8;
const MAX_CHANGES = 24;
const PER_PAGE = 12;

const kindOf = (c: ContentCollection) => {
  const l = COLLECTION_DEFS[c].label;
  const one: Record<string, string> = { Páginas: "Página", Obras: "Obra", Colecciones: "Colección", Ajustes: "Ajustes del sitio" };
  return one[l] ?? l;
};

export function whoName(email: string | undefined): string {
  if (!email) return "";
  const e = email.trim().toLowerCase();
  if (e === adminEmail()) return "Cali";
  const local = e.split("@")[0].split(/[._+-]/).filter(Boolean)[0] ?? e;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function docOf(collection: ContentCollection, id: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null): VersionDoc | null {
  const all = diffDocs(before, after, MAX_CHANGES + 40);
  const state = !before ? "added" : !after ? "removed" : "changed";
  if (state === "changed" && !all.length) return null; // solo cambiaron sellos internos
  const ref = (after ?? before)!;
  return {
    collection,
    id,
    title: titleOf(collection, ref),
    kind: kindOf(collection),
    state,
    changes: state === "changed" ? all.slice(0, MAX_CHANGES) : [],
    summary: state === "added" ? "Recién creado" : state === "removed" ? "Borrado del todo" : summarize(all),
    more: state === "changed" ? Math.max(0, all.length - MAX_CHANGES) : 0,
  };
}

// ---------------------------------------------------------------- GitHub

const GH = () => ({
  repo: process.env.GITHUB_REPO ?? "",
  branch: process.env.GITHUB_BRANCH ?? "main",
  dir: (process.env.GITHUB_CONTENT_DIR ?? "content").replace(/^\/+|\/+$/g, ""),
});
async function gh(path: string, raw = false): Promise<Response> {
  const token = process.env.GITHUB_TOKEN;
  return fetch(`https://api.github.com/repos/${GH().repo}${path}`, {
    cache: "no-store",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}
const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");

/** Un archivo tal como estaba en un commit (inmutable: se guarda para siempre). */
async function fileAt(path: string, sha: string): Promise<Record<string, unknown> | null> {
  "use cache";
  cacheLife("max");
  const r = await gh(`/contents/${enc(path)}?ref=${sha}`, true);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status} al leer una versión`);
  try {
    return JSON.parse(await r.text());
  } catch {
    return null;
  }
}

function parsePath(dir: string, file: string): { collection: ContentCollection; id: string } | null {
  const m = file.match(new RegExp(`^${dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([\\w-]+)/([\\w.-]+)\\.json$`));
  if (!m || !isContentCollection(m[1])) return null;
  return { collection: m[1], id: m[2] };
}

/** Una publicación entera: quién, cuándo y qué cambió en cada documento (inmutable). */
async function commitVersion(sha: string): Promise<Version> {
  "use cache";
  cacheLife("max");
  const { dir } = GH();
  const r = await gh(`/commits/${sha}`);
  if (!r.ok) throw new Error(`GitHub ${r.status} al leer una versión`);
  const c = (await r.json()) as {
    sha: string;
    parents: { sha: string }[];
    commit: { message: string; author: { name: string; email: string; date: string } };
    files?: { filename: string; status: string; previous_filename?: string }[];
  };
  const parent = c.parents[0]?.sha;
  const files = (c.files ?? [])
    .map((f) => ({ f, d: parsePath(dir, f.filename) }))
    .filter((x): x is { f: (typeof c.files & object)[number]; d: { collection: ContentCollection; id: string } } => !!x.d);
  // los ajustes del sitio cambian en cada publicación (un sello interno): al final, y solo si cambió algo de verdad
  files.sort((a, b) => Number(a.d.collection === "settings") - Number(b.d.collection === "settings"));
  const shown = files.slice(0, MAX_DOCS);
  const docs = (
    await Promise.all(
      shown.map(async ({ f, d }) => {
        const before = f.status === "added" || !parent ? null : await fileAt(f.previous_filename ?? f.filename, parent);
        const after = f.status === "removed" ? null : await fileAt(f.filename, sha);
        return docOf(d.collection, d.id, before, after);
      }),
    )
  ).filter((x): x is VersionDoc => !!x);
  const editor = /editor del sitio/i.test(c.commit.author.name) || /^Editor:/.test(c.commit.message);
  const by = c.commit.message.match(/^Por: (.+)$/m)?.[1];
  return {
    id: `g:${sha}`,
    at: c.commit.author.date,
    who: editor ? whoName(by) : c.commit.author.name.split(" ")[0] || "Código",
    by: editor ? "editor" : "code",
    docs,
    moreDocs: Math.max(0, files.length - shown.length),
  };
}

async function listGithub(scope: Scope, page: number): Promise<{ items: Version[]; next: number | null }> {
  const { branch, dir } = GH();
  const path = scope && isContentCollection(scope.collection) ? `${dir}/${scope.collection}/${scope.id}.json` : dir;
  const r = await gh(`/commits?sha=${encodeURIComponent(branch)}&path=${enc(path)}&per_page=${PER_PAGE}&page=${page}`);
  if (!r.ok) throw new Error(`GitHub ${r.status} al listar versiones`);
  const list = (await r.json()) as { sha: string }[];
  const items = await pool(list, 6, (c) => commitVersion(c.sha));
  const visible = items
    .map((v) => (scope ? { ...v, docs: v.docs.filter((d) => d.collection === scope.collection && d.id === scope.id), moreDocs: 0 } : v))
    .filter((v) => v.docs.length || v.moreDocs);
  return { items: visible, next: list.length === PER_PAGE ? page + 1 : null };
}

async function pool<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, xs.length) }, async () => {
      while (i < xs.length) {
        const k = i++;
        out[k] = await fn(xs[k]);
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------- registro local (desarrollo)

async function listAuditVersions(scope: Scope, cursor: string | null): Promise<{ items: Version[]; next: string | null }> {
  const items: Version[] = [];
  let after = cursor ?? undefined;
  let last: string | undefined;
  // se leen tandas hasta juntar una página de versiones (el registro también guarda entradas y salidas)
  for (let round = 0; round < 5 && items.length < PER_PAGE; round++) {
    const batch = await listAudit(40, after);
    if (!batch.length) return { items, next: null };
    for (const e of batch) {
      last = e.id;
      if (!e.collection || !e.docId || !isContentCollection(e.collection) || (!e.before && !e.after)) continue;
      if (scope && (scope.collection !== e.collection || scope.id !== e.docId)) continue;
      const d = docOf(e.collection, e.docId, (e.before as Record<string, unknown>) ?? null, (e.after as Record<string, unknown>) ?? null);
      if (!d) continue;
      items.push({ id: `a:${e.id}`, at: e.at, who: whoName(e.actor), by: "editor", docs: [d], moreDocs: 0 });
      if (items.length >= PER_PAGE) break;
    }
    after = last;
    if (batch.length < 40) return { items, next: items.length >= PER_PAGE ? (last ?? null) : null };
  }
  return { items, next: last ?? null };
}

// ---------------------------------------------------------------- API

const onGithub = () => getStore().kind === "github";

export async function listVersions(scope: Scope, cursor: string | null) {
  if (onGithub()) {
    const r = await listGithub(scope, Math.max(1, Number(cursor) || 1));
    return { items: r.items, next: r.next ? String(r.next) : null };
  }
  return listAuditVersions(scope, cursor);
}

/**
 * Volver atrás.
 *  - mode "this": el documento (o todos los de esa publicación) queda exactamente como estaba en esa versión.
 *  - mode "undo": deshace solo lo que cambió esa publicación (vuelve a como estaba justo antes).
 */
export async function restoreVersion(actor: string, versionId: string, mode: "this" | "undo", only?: { collection: string; id: string }) {
  const pick = (d: { collection: string; id: string }) => !only || (only.collection === d.collection && only.id === d.id);
  if (versionId.startsWith("a:")) {
    const entry = await getAudit(versionId.slice(2));
    if (!entry?.collection || !entry.docId || !isContentCollection(entry.collection)) return { ok: false as const, error: "Esa versión ya no está disponible." };
    if (mode === "undo") return revertAudit(actor, entry.id);
    return restoreDocs(actor, [{ collection: entry.collection, id: entry.docId, doc: (entry.after as Record<string, unknown>) ?? null }], "Vuelve a una versión anterior");
  }
  if (!versionId.startsWith("g:")) return { ok: false as const, error: "Versión inválida." };
  const sha = versionId.slice(2);
  if (!/^[0-9a-f]{7,40}$/.test(sha)) return { ok: false as const, error: "Versión inválida." };
  const v = await commitVersion(sha);
  const r = await gh(`/commits/${sha}`);
  const c = (await r.json()) as { parents: { sha: string }[]; files?: { filename: string; status: string; previous_filename?: string }[] };
  const parent = c.parents[0]?.sha;
  const { dir } = GH();
  const writes: { collection: ContentCollection; id: string; doc: Record<string, unknown> | null }[] = [];
  const wanted = new Set(v.docs.filter(pick).map((d) => `${d.collection}/${d.id}`));
  for (const f of c.files ?? []) {
    const d = parsePath(dir, f.filename);
    if (!d || !wanted.has(`${d.collection}/${d.id}`)) continue;
    const doc =
      mode === "this"
        ? f.status === "removed"
          ? null
          : await fileAt(f.filename, sha)
        : f.status === "added" || !parent
          ? null
          : await fileAt(f.previous_filename ?? f.filename, parent);
    writes.push({ collection: d.collection, id: d.id, doc });
  }
  if (!writes.length) return { ok: false as const, error: "No hay nada que volver atrás en esa versión." };
  return restoreDocs(actor, writes, mode === "this" ? "Vuelve a una versión anterior" : "Deshace una publicación");
}
