import "server-only";
import { createHash } from "node:crypto";
import { invalidateContent, nextContentVersion } from "@/lib/cache/server";
import type { CollectionName } from "@/lib/content/types";
import { audit, getAudit } from "./audit";
import { COLLECTION_DEFS, isContentCollection, type ContentCollection } from "./config";
import { applyOps, docKey, docsTouched, type DocMap, type InlineOp } from "./ops";
import { getAt } from "./paths";
import { fold, uniqueSlug } from "./slug";
import { getStore } from "./store";
import type { AnyDoc } from "./store/types";
import { validateDoc, type Errors } from "./validate";

export type DocStatus = "draft" | "published";
export type SaveIntent = "keep" | "publish" | "draft";

export interface AdminDoc extends AnyDoc {
  slug?: string;
  status?: DocStatus;
  trashed?: boolean;
  updatedAt?: string;
  createdAt?: string;
}

const now = () => new Date().toISOString();

export function titleOf(collection: ContentCollection, doc: Record<string, unknown>): string {
  const t = getAt(doc, COLLECTION_DEFS[collection].titleField.split("."));
  if (typeof t === "string" && t) return t;
  if (collection === "memories") {
    const cap = typeof doc.caption === "string" ? doc.caption.slice(0, 60) : "";
    return cap || (doc.year ? `Recuerdo de ${doc.year}` : "Recuerdo sin fecha");
  }
  return String(doc.slug ?? doc.id ?? "Sin título");
}

async function bumpVersion() {
  const store = getStore();
  await store.update("settings", "site", (cur) => ({
    next: { ...(cur ?? { siteName: "Cali Rivera", tagline: "El arte es para ser libres.", email: "arte@calirivera.com", location: "San José, Costa Rica", social: [], status: "published" }), id: "site", contentVersion: nextContentVersion(), updatedAt: now() },
    result: null,
  }));
}

function invalidate(collection: ContentCollection, slug?: string) {
  try {
    invalidateContent(collection as CollectionName, slug, "action");
  } catch (e) {
    // Outside a server action (scripts/tests) updateTag throws; content is still written.
    if (process.env.NODE_ENV !== "test") console.warn("[cms] invalidate", (e as Error).message);
  }
}

async function afterWrite(collection: ContentCollection, slug?: string) {
  await bumpVersion();
  invalidate(collection, slug);
}

// ---------- reads for the dashboard ----------

export async function listDocs(
  collection: ContentCollection,
  opts: { q?: string; status?: "all" | DocStatus | "trash"; page?: number; per?: number; where?: Record<string, string> } = {},
) {
  const def = COLLECTION_DEFS[collection];
  const all = (await getStore().list(collection)) as AdminDoc[];
  const q = fold(opts.q?.trim() ?? "");
  const status = opts.status ?? "all";
  let docs = all.filter((d) => (status === "trash" ? d.trashed : !d.trashed));
  if (status === "draft" || status === "published") docs = docs.filter((d) => (d.status ?? "published") === status);
  for (const [k, v] of Object.entries(opts.where ?? {})) if (v) docs = docs.filter((d) => String(d[k] ?? "") === v);
  if (q)
    docs = docs.filter((d) =>
      fold([titleOf(collection, d), d.slug, d.excerpt, d.discipline, d.technique, d.year, d.summary, d.caption, d.place, Array.isArray(d.people) ? d.people.join(" ") : ""].filter(Boolean).join(" ")).includes(q),
    );
  const key = def.sort;
  docs.sort((a, b) => {
    if (key === "order") return Number(a.order ?? 1e9) - Number(b.order ?? 1e9) || String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""));
    return String(b[key] ?? b.updatedAt ?? "").localeCompare(String(a[key] ?? a.updatedAt ?? ""));
  });
  const per = Math.min(Math.max(opts.per ?? 20, 5), 100);
  const pages = Math.max(1, Math.ceil(docs.length / per));
  const page = Math.min(Math.max(1, opts.page ?? 1), pages);
  return { items: docs.slice((page - 1) * per, page * per), total: docs.length, page, pages, per };
}

export async function getDoc(collection: ContentCollection, id: string) {
  return (await getStore().get(collection, id)) as AdminDoc | null;
}

/** Values allowed for selects that point to other collections. */
export async function dynamicOptions(collection: ContentCollection) {
  const out: Record<string, { value: string; label: string }[]> = {};
  for (const f of COLLECTION_DEFS[collection].fields) {
    if (!f.optionsFrom) continue;
    const docs = ((await getStore().list(f.optionsFrom)) as AdminDoc[]).filter((d) => !d.trashed);
    out[f.name] = docs.map((d) => ({ value: d.id, label: titleOf(f.optionsFrom!, d) }));
  }
  return out;
}

// ---------- writes ----------

export interface SaveResult {
  ok: boolean;
  id?: string;
  errors?: Errors;
  error?: string;
  auditId?: string;
  status?: DocStatus;
}

export async function saveDoc(
  actor: string,
  collection: ContentCollection,
  id: string | null,
  raw: Record<string, unknown>,
  intent: SaveIntent,
): Promise<SaveResult> {
  const def = COLLECTION_DEFS[collection];
  const store = getStore();
  const dyn = await dynamicOptions(collection);
  const { value, errors, ok } = validateDoc(def, raw, Object.fromEntries(Object.entries(dyn).map(([k, v]) => [k, v.map((o) => o.value)])));
  const existing = id ? ((await store.get(collection, id)) as AdminDoc | null) : null;
  if (id && !existing && !def.singleton) return { ok: false, error: "Ese contenido ya no existe." };
  if (!ok) return { ok: false, errors, error: "Revisá los campos marcados." };

  let docId = id ?? def.singleton ?? "";
  if (!docId) {
    const taken = new Set(((await store.list(collection)) as AdminDoc[]).flatMap((d) => [d.id, String(d.slug ?? "")]));
    if (collection === "programs") {
      docId = String(value.kind);
      if (taken.has(docId)) return { ok: false, errors: { kind: "Ese programa ya existe; editá el existente." }, error: "Ese programa ya existe." };
    } else {
      docId = uniqueSlug(String(value.slug ?? titleOf(collection, value)), taken);
    }
  }
  const prevStatus: DocStatus = existing?.status ?? "draft";
  const status: DocStatus = intent === "publish" ? "published" : intent === "draft" ? "draft" : existing ? prevStatus : "draft";

  // Locked fields keep their stored value once the document exists.
  const locked: Record<string, unknown> = {};
  if (existing) for (const f of def.fields) if (f.lockedAfterCreate && existing[f.name] !== undefined) locked[f.name] = existing[f.name];

  const ts = now();
  const next: AdminDoc = {
    ...(existing ?? {}),
    ...value,
    ...locked,
    id: docId,
    slug: (locked.slug as string) ?? (existing?.slug as string) ?? (def.singleton ? docId : docId),
    status,
    createdAt: existing?.createdAt ?? ts,
    updatedAt: ts,
  };
  if (collection === "artworks" && next.aiAltered === undefined) next.aiAltered = false;
  if (collection === "people" && !Array.isArray(next.programKinds)) next.programKinds = [];
  if (collection === "collections" && !Array.isArray(next.artworkIds)) next.artworkIds = [];
  for (const key of ["body", "sections", "featured"]) if (def.fields.some((f) => f.name === key) && !Array.isArray(next[key])) next[key] = [];
  delete next.trashed;

  await store.set(collection, docId, next);
  const action = !existing ? "create" : status !== prevStatus ? (status === "published" ? "publish" : "unpublish") : "update";
  const aId = await audit({ actor, action, collection, docId, title: titleOf(collection, next), before: existing, after: next });
  await afterWrite(collection, String(next.slug));
  return { ok: true, id: docId, auditId: aId, status };
}

export async function setStatus(actor: string, collection: ContentCollection, id: string, status: DocStatus) {
  const store = getStore();
  const doc = (await store.get(collection, id)) as AdminDoc | null;
  if (!doc) return { ok: false as const, error: "No existe." };
  const next = { ...doc, status, updatedAt: now() };
  await store.set(collection, id, next);
  const aId = await audit({ actor, action: status === "published" ? "publish" : "unpublish", collection, docId: id, title: titleOf(collection, doc), before: doc, after: next });
  await afterWrite(collection, String(doc.slug ?? id));
  return { ok: true as const, auditId: aId };
}

export async function trashDoc(actor: string, collection: ContentCollection, id: string) {
  const store = getStore();
  const doc = (await store.get(collection, id)) as AdminDoc | null;
  if (!doc) return { ok: false as const, error: "No existe." };
  if (COLLECTION_DEFS[collection].singleton) return { ok: false as const, error: "Esto no se puede borrar." };
  const next = { ...doc, trashed: true, trashedAt: now(), prevStatus: doc.status ?? "published", status: "draft", updatedAt: now() };
  await store.set(collection, id, next);
  const aId = await audit({ actor, action: "trash", collection, docId: id, title: titleOf(collection, doc), before: doc, after: next });
  await afterWrite(collection, String(doc.slug ?? id));
  return { ok: true as const, auditId: aId };
}

export async function restoreDoc(actor: string, collection: ContentCollection, id: string) {
  const store = getStore();
  const doc = (await store.get(collection, id)) as AdminDoc | null;
  if (!doc) return { ok: false as const, error: "No existe." };
  const { trashed: _t, trashedAt: _ta, prevStatus, ...rest } = doc as AdminDoc & { trashedAt?: string; prevStatus?: DocStatus };
  void _t;
  void _ta;
  const next = { ...rest, status: prevStatus ?? "draft", updatedAt: now() };
  await store.set(collection, id, next);
  const aId = await audit({ actor, action: "restore", collection, docId: id, title: titleOf(collection, doc), before: doc, after: next });
  await afterWrite(collection, String(doc.slug ?? id));
  return { ok: true as const, auditId: aId };
}

export async function purgeDoc(actor: string, collection: ContentCollection, id: string) {
  const store = getStore();
  const doc = (await store.get(collection, id)) as AdminDoc | null;
  if (!doc?.trashed) return { ok: false as const, error: "Solo se puede borrar para siempre desde la papelera." };
  await store.delete(collection, id);
  await audit({ actor, action: "purge", collection, docId: id, title: titleOf(collection, doc), before: doc, after: null });
  await afterWrite(collection);
  return { ok: true as const };
}

/** Puts a document back as it was before an audit entry. */
export async function revertAudit(actor: string, auditEntryId: string) {
  const entry = await getAudit(auditEntryId);
  if (!entry?.collection || !entry.docId || !isContentCollection(entry.collection)) return { ok: false as const, error: "Ese cambio no se puede deshacer." };
  const store = getStore();
  const current = (await store.get(entry.collection, entry.docId)) as AdminDoc | null;
  if (entry.before) await store.set(entry.collection, entry.docId, { ...entry.before, updatedAt: now() });
  else await store.delete(entry.collection, entry.docId);
  const aId = await audit({
    actor,
    action: "revert",
    collection: entry.collection,
    docId: entry.docId,
    title: entry.title,
    before: current,
    after: entry.before ?? null,
    note: "Deshace un cambio anterior",
  });
  await afterWrite(entry.collection, String(entry.before?.slug ?? entry.docId));
  return { ok: true as const, auditId: aId };
}

// ---------- inline editing ----------

export interface InlineResult {
  ok: boolean;
  error?: string;
  created?: Record<string, string>;
  changed?: string[];
}

export async function applyInline(actor: string, ops: InlineOp[]): Promise<InlineResult> {
  const store = getStore();
  const docs: DocMap = new Map();
  for (const { collection, id } of docsTouched(ops)) {
    if (!isContentCollection(collection)) return { ok: false, error: `No se puede editar ${collection}.` };
    const d = await store.get(collection, id);
    if (!d) return { ok: false, error: `No encontré ${collection}/${id}. Recargá la página.` };
    docs.set(docKey(collection, id), d);
  }
  const before = new Map(docs);
  let result;
  try {
    result = applyOps(docs, ops, isContentCollection);
  } catch (e) {
    return { ok: false, error: `No se pudo aplicar el cambio: ${(e as Error).message}` };
  }

  const ts = now();
  const created: Record<string, string> = {};
  const changed: string[] = [];
  // Real ids for new documents (validated with the collection's schema).
  for (const c of result.created) {
    const col = c.collection as ContentCollection;
    const raw = result.docs.get(docKey(col, c.tempId))!;
    const def = COLLECTION_DEFS[col];
    const { value, ok, errors } = validateDoc(def, raw);
    if (!ok) return { ok: false, error: Object.values(errors)[0] ?? "Faltan datos" };
    const taken = new Set(((await store.list(col)) as AdminDoc[]).flatMap((d) => [d.id, String(d.slug ?? "")]));
    for (const id of Object.values(created)) taken.add(id);
    const id = uniqueSlug(titleOf(col, value), taken);
    created[c.tempId] = id;
    const doc: AdminDoc = { ...value, id, slug: id, status: "published", createdAt: ts, updatedAt: ts };
    if (col === "artworks" && doc.aiAltered === undefined) doc.aiAltered = false;
    if (col === "people" && !Array.isArray(doc.programKinds)) doc.programKinds = [];
    for (const k of ["body", "featured"]) if (def.fields.some((f) => f.name === k) && !Array.isArray(doc[k])) doc[k] = [];
    if (col === "posts" && !doc.publishedAt) doc.publishedAt = ts;
    await store.set(col, id, doc);
    await audit({ actor, action: "create", collection: col, docId: id, title: titleOf(col, doc), before: null, after: doc, note: "Desde la página" });
    changed.push(`${col}/${id}`);
  }
  const trashed = new Set(result.trashed.map((t) => docKey(t.collection, t.id)));
  for (const [key, doc] of result.docs) {
    const [col, id] = key.split("/") as [ContentCollection, string];
    if (result.created.some((c) => c.tempId === id && c.collection === col)) continue;
    if (trashed.has(key)) continue;
    const prev = before.get(key);
    if (prev && JSON.stringify(prev) === JSON.stringify(doc)) continue;
    const next = { ...doc, id, updatedAt: ts };
    await store.set(col, id, next);
    await audit({ actor, action: "inline", collection: col, docId: id, title: titleOf(col, next), before: prev ?? null, after: next });
    changed.push(key);
  }
  for (const t of result.trashed) {
    await trashDoc(actor, t.collection as ContentCollection, t.id);
    changed.push(docKey(t.collection, t.id));
  }
  const cols = new Set(changed.map((k) => k.split("/")[0] as ContentCollection));
  if (changed.length) await bumpVersion();
  for (const c of cols) invalidate(c);
  for (const k of changed) {
    const [c, id] = k.split("/") as [ContentCollection, string];
    invalidate(c, id);
  }
  return { ok: true, created, changed };
}

const draftId = (pathname: string) => createHash("sha1").update(pathname).digest("hex").slice(0, 24);

export async function saveInlineDraft(actor: string, pathname: string, ops: InlineOp[]) {
  await getStore().set("drafts", draftId(pathname), { pathname, ops, actor, savedAt: now() });
  return { ok: true as const, savedAt: now() };
}

export async function loadInlineDraft(pathname: string) {
  const d = await getStore().get("drafts", draftId(pathname));
  return d ? { ops: (d.ops as InlineOp[]) ?? [], savedAt: String(d.savedAt ?? "") } : null;
}

export async function discardInlineDraft(pathname: string) {
  await getStore().delete("drafts", draftId(pathname));
  return { ok: true as const };
}

export async function listInlineDrafts() {
  return (await getStore().list("drafts")).map((d) => ({ pathname: String(d.pathname), savedAt: String(d.savedAt), count: Array.isArray(d.ops) ? d.ops.length : 0 }));
}
