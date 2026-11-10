/**
 * Field paths used by the CMS contract (src/components/cms/editable.tsx):
 *   "<collection>/<docId>#<field.path>"   e.g. "pages/biografia#sections.2.blocks.0.text"
 *   "<collection>"                         a whole collection list (e.g. "posts")
 * Pure module (no server-only) so it can be shared by client overlay, server and tests.
 */
export type ParsedPath =
  | { kind: "field"; collection: string; docId: string; field: string[] }
  | { kind: "collection"; collection: string };

export function parsePath(path: string): ParsedPath | null {
  const p = path.trim();
  if (!p) return null;
  const hash = p.indexOf("#");
  if (hash === -1) {
    if (!/^[a-zA-Z][\w-]*$/.test(p)) return null;
    return { kind: "collection", collection: p };
  }
  const left = p.slice(0, hash);
  const field = p.slice(hash + 1);
  const slash = left.indexOf("/");
  if (slash <= 0 || !field) return null;
  const collection = left.slice(0, slash);
  const docId = left.slice(slash + 1);
  if (!collection || !docId || docId.includes("/")) return null;
  const segs = field.split(".");
  if (segs.some((s) => !s || s === "__proto__" || s === "constructor" || s === "prototype")) return null;
  return { kind: "field", collection, docId, field: segs };
}

export function formatPath(collection: string, docId: string, field: (string | number)[]): string {
  return `${collection}/${docId}#${field.join(".")}`;
}

const isIndex = (s: string) => /^\d+$/.test(s);

type Obj = Record<string, unknown>;

export function getAt(root: unknown, field: string[]): unknown {
  let cur: unknown = root;
  for (const seg of field) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = Array.isArray(cur) ? (isIndex(seg) ? cur[Number(seg)] : undefined) : (cur as Obj)[seg];
  }
  return cur;
}

/** Immutable set; creates intermediate objects/arrays as needed. */
export function setAt<T>(root: T, field: string[], value: unknown): T {
  if (field.length === 0) return value as T;
  const [head, ...rest] = field;
  if (Array.isArray(root)) {
    if (!isIndex(head)) throw new PathError(`índice inválido: ${head}`);
    const i = Number(head);
    if (i > root.length) throw new PathError(`índice fuera de rango: ${i}`);
    const copy = root.slice();
    copy[i] = setAt(root[i], rest, value);
    return copy as T;
  }
  const base: Obj = root && typeof root === "object" ? { ...(root as Obj) } : {};
  const nextChild = base[head] ?? (rest.length && isIndex(rest[0]) ? [] : {});
  base[head] = setAt(nextChild, rest, value);
  return base as T;
}

function getArray(root: unknown, field: string[]): unknown[] {
  const v = getAt(root, field);
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new PathError(`no es una lista: ${field.join(".")}`);
  return v;
}

export function insertAt<T>(root: T, field: string[], index: number, value: unknown): T {
  const arr = getArray(root, field).slice();
  const i = Math.max(0, Math.min(index, arr.length));
  arr.splice(i, 0, value);
  return setAt(root, field, arr);
}

export function removeAt<T>(root: T, field: string[], index: number): T {
  const arr = getArray(root, field).slice();
  if (index < 0 || index >= arr.length) throw new PathError(`índice fuera de rango: ${index}`);
  arr.splice(index, 1);
  return setAt(root, field, arr);
}

export function moveAt<T>(root: T, field: string[], from: number, to: number): T {
  const arr = getArray(root, field).slice();
  if (from < 0 || from >= arr.length) throw new PathError(`índice fuera de rango: ${from}`);
  const [item] = arr.splice(from, 1);
  arr.splice(Math.max(0, Math.min(to, arr.length)), 0, item);
  return setAt(root, field, arr);
}

export class PathError extends Error {}
