/**
 * DOM side of inline editing. Each applier mutates the live page to preview an
 * InlineOp and returns an undo function. Pure DOM, no React: the public pages are
 * mostly server-rendered, and after publishing the page is reloaded anyway.
 */
import type { InlineOp } from "@/lib/cms/ops";
import { getAt, parsePath } from "@/lib/cms/paths";
import type { ImageAsset } from "@/lib/content/types";
import { previewFor } from "../shared/imageClient";

export type Undo = () => void;
export const UI_ATTR = "data-cms-ui";

const q = (sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<HTMLElement>(sel));
const esc = (s: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&"));

export const byPath = (path: string, root: ParentNode = document) => q(`[data-cms-path="${esc(path)}"]`, root);
export const kindOf = (el: Element) => el.getAttribute("data-cms-kind") ?? "text";

export function listEl(path: string): HTMLElement | null {
  return byPath(path).find((el) => kindOf(el) === "list") ?? null;
}

export function listItems(list: HTMLElement): HTMLElement[] {
  return Array.from(list.children).filter((c): c is HTMLElement => c instanceof HTMLElement && !c.hasAttribute(UI_ATTR) && !c.hasAttribute("data-cms-removed"));
}

/** Text as the editor sees it (no trailing newline, nbsp → space). */
export function readText(el: HTMLElement, multiline: boolean): string {
  let src: HTMLElement = el;
  if (el.querySelector(`[${UI_ATTR}]`)) {
    src = el.cloneNode(true) as HTMLElement;
    src.querySelectorAll(`[${UI_ATTR}]`).forEach((n) => n.remove());
  }
  const raw = (src.innerText || src.textContent || "").replace(/\u00a0/g, " ");
  return multiline ? raw.replace(/\n+$/, "") : raw.replace(/\s*\n\s*/g, " ").trim();
}

function writeText(el: HTMLElement, value: string) {
  if (kindOf(el) === "richtext") el.innerText = value;
  else el.textContent = value;
}

type ImgSnapshot = { src: string | null; srcset: string | null; sizes: string | null; alt: string | null; sources: [HTMLSourceElement, string | null][] };

function snapImg(img: HTMLImageElement): ImgSnapshot {
  const pic = img.parentElement?.tagName === "PICTURE" ? q("source", img.parentElement) : [];
  return {
    src: img.getAttribute("src"),
    srcset: img.getAttribute("srcset"),
    sizes: img.getAttribute("sizes"),
    alt: img.getAttribute("alt"),
    sources: (pic as HTMLSourceElement[]).map((s) => [s, s.getAttribute("srcset")]),
  };
}
function restoreImg(img: HTMLImageElement, s: ImgSnapshot) {
  const set = (k: string, v: string | null) => (v === null ? img.removeAttribute(k) : img.setAttribute(k, v));
  set("src", s.src);
  set("srcset", s.srcset);
  set("sizes", s.sizes);
  set("alt", s.alt);
  for (const [src, v] of s.sources) {
    if (v === null) src.removeAttribute("srcset");
    else src.setAttribute("srcset", v);
  }
}
function writeImg(el: HTMLElement, asset: ImageAsset | undefined): Undo {
  const img = (el.tagName === "IMG" ? el : el.querySelector("img")) as HTMLImageElement | null;
  if (!img) return () => {};
  const snap = snapImg(img);
  for (const [src] of snap.sources) src.removeAttribute("srcset");
  img.removeAttribute("srcset");
  img.removeAttribute("sizes");
  if (asset?.src) {
    img.src = previewFor(asset.src);
    img.alt = asset.alt ?? "";
    img.style.removeProperty("opacity");
  } else {
    img.removeAttribute("src");
  }
  return () => restoreImg(img, snap);
}

/** Write any value into every element bound to `path`. */
export function writePath(path: string, value: unknown, root: ParentNode = document): Undo {
  const undos: Undo[] = [];
  for (const el of byPath(path, root)) {
    const kind = kindOf(el);
    if (kind === "list") continue;
    if (kind === "image") {
      undos.push(writeImg(el, value as ImageAsset | undefined));
    } else if (typeof value === "string" || typeof value === "number") {
      const prev = el.innerText;
      const k = kind;
      writeText(el, String(value));
      undos.push(() => {
        if (k === "richtext") el.innerText = prev;
        else el.textContent = prev;
      });
    }
  }
  return () => undos.reverse().forEach((u) => u());
}

/** Renumber descendant paths of an array list after a structural change. */
export function renumber(list: HTMLElement, listPath: string) {
  const prefix = `${listPath}.`;
  listItems(list).forEach((item, k) => {
    const nodes = [item, ...q("[data-cms-path]", item)];
    for (const n of nodes) {
      const p = n.getAttribute("data-cms-path");
      if (!p || !p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      const dot = rest.indexOf(".");
      const tail = dot === -1 ? "" : rest.slice(dot);
      n.setAttribute("data-cms-path", `${prefix}${k}${tail}`);
    }
  });
}

/** Fill a cloned item: every bound descendant gets its value from `value` (relative field path). */
function fillClone(clone: HTMLElement, base: string, value: unknown) {
  for (const n of [clone, ...q("[data-cms-path]", clone)]) {
    const p = n.getAttribute("data-cms-path");
    if (!p || !p.startsWith(base)) continue;
    const rel = p.slice(base.length).replace(/^[.#]/, "");
    const v = rel ? getAt(value, rel.split(".")) : value;
    const kind = kindOf(n);
    if (kind === "image") {
      writeImg(n, v as ImageAsset | undefined);
      if (!v) (n.tagName === "IMG" ? n : n.querySelector("img"))?.setAttribute("style", "opacity:.25");
    } else if (kind !== "list") {
      writeText(n, typeof v === "string" || typeof v === "number" ? String(v) : "");
    }
  }
}

function placeholderItem(value: unknown): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-cms-placeholder", "");
  const v = value as Record<string, unknown> | string;
  const label = typeof v === "string" ? v : String(v?.title ?? v?.name ?? v?.text ?? v?.label ?? (v?.type ? `Nuevo bloque: ${v.type}` : "Nuevo elemento"));
  el.textContent = label;
  return el;
}

function insertNode(list: HTMLElement, node: HTMLElement, index: number) {
  const items = listItems(list);
  const ref = items[index] ?? null;
  if (ref) list.insertBefore(node, ref);
  else {
    // after the last real item (UI hosts may live inside the list)
    const last = items[items.length - 1];
    if (last) last.after(node);
    else list.prepend(node);
  }
}

export function itemDocId(item: HTMLElement, collection: string): string | null {
  const own = item.getAttribute("data-cms-path");
  const el = own?.startsWith(`${collection}/`) ? item : item.querySelector<HTMLElement>(`[data-cms-path^="${esc(collection)}/"]`);
  const p = el ? parsePath(el.getAttribute("data-cms-path") ?? "") : null;
  return p?.kind === "field" ? p.docId : null;
}

function detach(node: HTMLElement): Undo {
  const parent = node.parentNode;
  const next = node.nextSibling;
  node.remove();
  return () => parent?.insertBefore(node, next);
}

// ---------- appliers ----------

export function applyDom(op: InlineOp): Undo {
  switch (op.t) {
    case "set":
      return writePath(op.path, op.value);

    case "insert": {
      const list = listEl(op.path);
      if (!list) return () => {};
      const items = listItems(list);
      const template = items[Math.min(op.index, items.length - 1)] ?? items[items.length - 1];
      let node: HTMLElement;
      if (template) {
        node = template.cloneNode(true) as HTMLElement;
        q(`[${UI_ATTR}]`, node).forEach((n) => n.remove());
        node.setAttribute("data-cms-new", "");
        insertNode(list, node, op.index);
        renumber(list, op.path);
        fillClone(node, `${op.path}.${listItems(list).indexOf(node)}`, op.value);
      } else {
        node = placeholderItem(op.value);
        insertNode(list, node, op.index);
      }
      return () => {
        node.remove();
        renumber(list, op.path);
      };
    }

    case "remove": {
      const list = listEl(op.path);
      const item = list ? listItems(list)[op.index] : undefined;
      if (!list || !item) return () => {};
      const undo = detach(item);
      renumber(list, op.path);
      return () => {
        undo();
        renumber(list, op.path);
      };
    }

    case "move": {
      const list = listEl(op.path);
      const item = list ? listItems(list)[op.from] : undefined;
      if (!list || !item) return () => {};
      item.remove();
      insertNode(list, item, op.to);
      renumber(list, op.path);
      return () => {
        item.remove();
        insertNode(list, item, op.from);
        renumber(list, op.path);
      };
    }

    case "create": {
      const list = listEl(op.collection);
      if (!list) return () => {};
      const items = listItems(list);
      const template = items[0];
      let node: HTMLElement;
      if (template) {
        node = template.cloneNode(true) as HTMLElement;
        q(`[${UI_ATTR}]`, node).forEach((n) => n.remove());
        const oldId = itemDocId(template, op.collection);
        if (oldId) {
          for (const n of [node, ...q("[data-cms-path]", node)]) {
            const p = n.getAttribute("data-cms-path");
            if (p?.startsWith(`${op.collection}/${oldId}#`)) n.setAttribute("data-cms-path", p.replace(`${op.collection}/${oldId}#`, `${op.collection}/${op.tempId}#`));
          }
        }
        // Links in the clone would point to the template's page.
        q("a[href]", node).forEach((a) => a.setAttribute("href", "#"));
        node.setAttribute("data-cms-new", "");
        fillClone(node, `${op.collection}/${op.tempId}#`, op.value);
      } else node = placeholderItem(op.value);
      insertNode(list, node, op.collection === "posts" ? 0 : items.length);
      return () => node.remove();
    }

    case "reorder": {
      const list = listEl(op.collection);
      if (!list) return () => {};
      const before = listItems(list);
      const byId = new Map(before.map((i) => [itemDocId(i, op.collection), i]));
      const ordered = op.ids.map((id) => byId.get(id)).filter(Boolean) as HTMLElement[];
      const anchor = before[0]?.previousSibling ?? null;
      const parent = list;
      ordered.forEach((n) => n.remove());
      let ref: ChildNode | null = anchor ? anchor.nextSibling : parent.firstChild;
      for (const n of ordered) {
        parent.insertBefore(n, ref);
        ref = n.nextSibling;
      }
      return () => {
        before.forEach((n) => n.remove());
        let r: ChildNode | null = anchor ? anchor.nextSibling : parent.firstChild;
        for (const n of before) {
          parent.insertBefore(n, r);
          r = n.nextSibling;
        }
      };
    }

    case "archive":
    case "trash": {
      const list = listEl(op.collection);
      const item = list ? listItems(list).find((i) => itemDocId(i, op.collection) === op.id) : undefined;
      return item ? detach(item) : () => {};
    }
  }
}

export function supportsPlaintextOnly(): boolean {
  const d = document.createElement("div");
  try {
    d.contentEditable = "plaintext-only";
    return d.contentEditable === "plaintext-only";
  } catch {
    return false;
  }
}
