/**
 * Inline-editing operations (overlay → server). Serializable and replayable:
 * the overlay applies them to the DOM for preview, drafts store them, and
 * publish applies them in order to the documents. Pure module.
 */
import { insertAt, moveAt, parsePath, PathError, removeAt, setAt } from "./paths";

export type InlineOp =
  | { t: "set"; path: string; value: unknown }
  | { t: "insert"; path: string; index: number; value: unknown }
  | { t: "move"; path: string; from: number; to: number }
  | { t: "remove"; path: string; index: number }
  /** New document in a collection-level list. `tempId` is used by later ops until the real id exists. */
  | { t: "create"; collection: string; tempId: string; value: Record<string, unknown> }
  | { t: "reorder"; collection: string; ids: string[] }
  | { t: "trash"; collection: string; id: string }
  /** Archivar: deja de verse en el sitio pero no se borra (queda como «oculto» en el panel). */
  | { t: "archive"; collection: string; id: string };

export type DocKey = `${string}/${string}`;
export type DocMap = Map<DocKey, Record<string, unknown>>;

export const docKey = (collection: string, id: string) => `${collection}/${id}` as DocKey;

/** Which existing documents a list of ops needs loaded (temp ids excluded). */
export function docsTouched(ops: InlineOp[]): { collection: string; id: string }[] {
  const temp = new Set(ops.flatMap((o) => (o.t === "create" ? [o.tempId] : [])));
  const out = new Map<string, { collection: string; id: string }>();
  const add = (collection: string, id: string) => {
    if (!temp.has(id)) out.set(docKey(collection, id), { collection, id });
  };
  for (const op of ops) {
    if (op.t === "set" || op.t === "insert" || op.t === "move" || op.t === "remove") {
      const p = parsePath(op.path);
      if (p?.kind === "field") add(p.collection, p.docId);
    } else if (op.t === "reorder") op.ids.forEach((id) => add(op.collection, id));
    else if (op.t === "trash" || op.t === "archive") add(op.collection, op.id);
  }
  return [...out.values()];
}

export interface ApplyResult {
  docs: DocMap;
  created: { collection: string; tempId: string }[];
  trashed: { collection: string; id: string }[];
  /** collection → ordered ids */
  reordered: { collection: string; ids: string[] }[];
}

/**
 * Applies ops in order on copies of `docs`. Created docs are keyed by tempId;
 * the caller assigns real ids afterwards (see write.ts).
 */
export function applyOps(input: DocMap, ops: InlineOp[], allowed: (collection: string) => boolean): ApplyResult {
  const docs: DocMap = new Map(input);
  const res: ApplyResult = { docs, created: [], trashed: [], reordered: [] };
  const need = (collection: string, id: string) => {
    if (!allowed(collection)) throw new PathError(`colección no editable: ${collection}`);
    const d = docs.get(docKey(collection, id));
    if (!d) throw new PathError(`no existe: ${collection}/${id}`);
    return d;
  };
  for (const op of ops) {
    if (op.t === "create") {
      if (!allowed(op.collection)) throw new PathError(`colección no editable: ${op.collection}`);
      docs.set(docKey(op.collection, op.tempId), { ...op.value });
      res.created.push({ collection: op.collection, tempId: op.tempId });
      continue;
    }
    if (op.t === "reorder") {
      op.ids.forEach((id) => need(op.collection, id));
      op.ids.forEach((id, i) => docs.set(docKey(op.collection, id), { ...need(op.collection, id), order: (i + 1) * 10 }));
      res.reordered.push({ collection: op.collection, ids: op.ids });
      continue;
    }
    if (op.t === "archive") {
      docs.set(docKey(op.collection, op.id), { ...need(op.collection, op.id), status: "draft", archived: true });
      continue;
    }
    if (op.t === "trash") {
      need(op.collection, op.id);
      res.trashed.push({ collection: op.collection, id: op.id });
      continue;
    }
    const p = parsePath(op.path);
    if (!p || p.kind !== "field") throw new PathError(`ruta inválida: ${op.path}`);
    const key = docKey(p.collection, p.docId);
    const doc = need(p.collection, p.docId);
    let next: Record<string, unknown>;
    switch (op.t) {
      case "set":
        next = setAt(doc, p.field, op.value);
        break;
      case "insert":
        next = insertAt(doc, p.field, op.index, op.value);
        break;
      case "remove":
        next = removeAt(doc, p.field, op.index);
        break;
      case "move":
        next = moveAt(doc, p.field, op.from, op.to);
        break;
    }
    docs.set(key, next);
  }
  return res;
}

/** Basic shape check for ops arriving from the client. */
export function isInlineOps(x: unknown): x is InlineOp[] {
  if (!Array.isArray(x) || x.length > 500) return false;
  return x.every((o) => {
    if (!o || typeof o !== "object") return false;
    const op = o as Record<string, unknown>;
    switch (op.t) {
      case "set":
        return typeof op.path === "string";
      case "insert":
        return typeof op.path === "string" && Number.isInteger(op.index);
      case "remove":
        return typeof op.path === "string" && Number.isInteger(op.index);
      case "move":
        return typeof op.path === "string" && Number.isInteger(op.from) && Number.isInteger(op.to);
      case "create":
        return typeof op.collection === "string" && typeof op.tempId === "string" && !!op.value && typeof op.value === "object";
      case "reorder":
        return typeof op.collection === "string" && Array.isArray(op.ids) && op.ids.every((i) => typeof i === "string");
      case "trash":
      case "archive":
        return typeof op.collection === "string" && typeof op.id === "string";
      default:
        return false;
    }
  });
}
