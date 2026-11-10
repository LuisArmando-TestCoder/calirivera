/**
 * Edit session on a public page: binds contenteditable, image taps and list tools
 * to the server-rendered markup that carries data-cms-* attributes. Plain DOM (no React),
 * torn down completely on exit.
 */
import type { InlineOp } from "@/lib/cms/ops";
import { parsePath } from "@/lib/cms/paths";
import type { ImageAsset } from "@/lib/content/types";
import { itemDocId, kindOf, listItems, readText, supportsPlaintextOnly, UI_ATTR } from "./dom";

export type ListCtx = { el: HTMLElement; path: string; itemType: string; collection: string | null };

export interface SessionHandlers {
  commit: (op: InlineOp) => void;
  pickImage: (path: string, initial: ImageAsset | null, insert?: ListCtx) => void;
  addItem: (ctx: ListCtx) => void;
  askDelete: (ctx: ListCtx, item: HTMLElement) => void;
  notice: (text: string) => void;
  undo: () => void;
}

export function listCtx(el: HTMLElement): ListCtx {
  const path = el.getAttribute("data-cms-path") ?? "";
  const itemType = el.getAttribute("data-cms-item") ?? "block";
  const p = parsePath(path);
  // "posts" (no "#") = a collection-level list; anything else is an array field inside one document.
  return { el, path, itemType, collection: p?.kind === "collection" ? p.collection : null };
}

export class EditSession {
  private bound = new WeakSet<HTMLElement>();
  private cleanup: (() => void)[] = [];
  private plain = supportsPlaintextOnly();

  constructor(private h: SessionHandlers) {}

  start() {
    document.documentElement.classList.add("cms-editing");
    const onClick = (e: MouseEvent) => this.onClick(e);
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey);
    this.cleanup.push(() => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("cms-editing");
    });
    this.scan();
  }

  stop() {
    this.cleanup.splice(0).reverse().forEach((f) => f());
    document.querySelectorAll(`[${UI_ATTR}]`).forEach((n) => n.remove());
    this.bound = new WeakSet();
  }

  /** (Re)bind everything; safe to call after any DOM change. */
  scan() {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-cms-path]"))) {
      if (el.closest(`[${UI_ATTR}],[data-cms-admin],[data-cms-bar],dialog`)) continue;
      const kind = kindOf(el);
      if (kind === "list") {
        this.decorateList(el);
        continue;
      }
      if (this.bound.has(el)) continue;
      this.bound.add(el);
      if (kind === "image") this.bindImage(el);
      else this.bindText(el, kind === "richtext");
    }
  }

  private bindImage(el: HTMLElement) {
    const prev = { tabindex: el.getAttribute("tabindex"), role: el.getAttribute("role"), label: el.getAttribute("aria-label") };
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", "Cambiar foto");
    this.cleanup.push(() => {
      for (const [k, v] of [
        ["tabindex", prev.tabindex],
        ["role", prev.role],
        ["aria-label", prev.label],
      ] as const) {
        if (v === null) el.removeAttribute(k);
        else el.setAttribute(k, v);
      }
    });
  }

  private bindText(el: HTMLElement, multiline: boolean) {
    el.setAttribute("contenteditable", this.plain ? "plaintext-only" : "true");
    el.spellcheck = true;
    let before = "";
    const onFocus = () => {
      before = readText(el, multiline);
    };
    const onBlur = () => {
      const path = el.getAttribute("data-cms-path");
      if (!path) return;
      const after = readText(el, multiline);
      if (after === before) return;
      // Put the old text back so the op's preview (which updates every twin) owns the undo.
      if (multiline) el.innerText = before;
      else el.textContent = before;
      this.h.commit({ t: "set", path, value: after });
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      let text = e.clipboardData?.getData("text/plain") ?? "";
      if (!multiline) text = text.replace(/\s*\n\s*/g, " ");
      document.execCommand("insertText", false, text);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !multiline) {
        e.preventDefault();
        el.blur();
      } else if (e.key === "Escape") {
        if (multiline) el.innerText = before;
        else el.textContent = before;
        el.blur();
      }
    };
    const onDrop = (e: DragEvent) => e.preventDefault();
    el.addEventListener("focus", onFocus);
    el.addEventListener("blur", onBlur);
    el.addEventListener("paste", onPaste);
    el.addEventListener("keydown", onKey);
    el.addEventListener("drop", onDrop);
    this.cleanup.push(() => {
      el.removeAttribute("contenteditable");
      el.removeEventListener("focus", onFocus);
      el.removeEventListener("blur", onBlur);
      el.removeEventListener("paste", onPaste);
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("drop", onDrop);
    });
  }

  private decorateList(el: HTMLElement) {
    const ctx = listCtx(el);
    const next = el.nextElementSibling;
    if (!(next instanceof HTMLElement && next.getAttribute(UI_ATTR) === "add" && next.dataset.for === ctx.path)) {
      const host = document.createElement("div");
      host.setAttribute(UI_ATTR, "add");
      host.dataset.for = ctx.path;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cms-add";
      btn.textContent = "＋ Agregar";
      btn.addEventListener("click", () => (ctx.itemType === "image" ? this.h.pickImage(ctx.path, null, ctx) : this.h.addItem(ctx)));
      host.appendChild(btn);
      el.after(host);
      this.cleanup.push(() => host.remove());
    }
    // Rebuild the tools every time (items may have moved). An item that is itself editable
    // (e.g. a <p> bound to a field) gets its toolbar as a sibling so the bar never ends up in the text.
    el.querySelectorAll(':scope > [data-cms-ui="tools"], :scope > * > [data-cms-ui="tools"]').forEach((n) => n.remove());
    for (const item of listItems(el)) {
      const selfEditable = item.hasAttribute("data-cms-kind") || /^(IMG|INPUT|VIDEO|BR|HR|P|H[1-6]|SPAN|A|BLOCKQUOTE)$/.test(item.tagName);
      const tools = document.createElement("div");
      tools.setAttribute(UI_ATTR, "tools");
      tools.className = "cms-tools";
      const mk = (label: string, aria: string, act: string) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.setAttribute("aria-label", aria);
        b.dataset.act = act;
        return b;
      };
      tools.append(mk("↑", "Mover antes", "up"), mk("↓", "Mover después", "down"), mk("×", "Quitar", "del"));
      tools.addEventListener("click", (e) => {
        const b = (e.target as HTMLElement).closest("button");
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        const items = listItems(el);
        const idx = items.indexOf(item);
        if (b.dataset.act === "del") return this.h.askDelete(ctx, item);
        const to = b.dataset.act === "up" ? idx - 1 : idx + 1;
        if (to < 0 || to >= items.length) return;
        if (ctx.collection) {
          const ids = items.map((n) => itemDocId(n, ctx.collection!)).filter(Boolean) as string[];
          const [m] = ids.splice(idx, 1);
          ids.splice(to, 0, m);
          this.h.commit({ t: "reorder", collection: ctx.collection, ids });
        } else this.h.commit({ t: "move", path: ctx.path, from: idx, to });
      });
      if (selfEditable) item.before(tools);
      else item.prepend(tools);
    }
    this.refreshTools(el);
  }

  refreshTools(list?: HTMLElement) {
    const lists = list ? [list] : Array.from(document.querySelectorAll<HTMLElement>('[data-cms-kind="list"]'));
    for (const l of lists) {
      const items = listItems(l);
      items.forEach((item, i) => {
        const t = Array.from(item.children).find((c) => c.getAttribute(UI_ATTR) === "tools");
        if (!t) return;
        (t.querySelector('[data-act="up"]') as HTMLButtonElement).disabled = i === 0;
        (t.querySelector('[data-act="down"]') as HTMLButtonElement).disabled = i === items.length - 1;
      });
    }
  }

  private onClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (t.closest(`[${UI_ATTR}],dialog,[data-cms-bar]`)) return;
    const img = t.closest<HTMLElement>('[data-cms-kind="image"]');
    if (img) {
      e.preventDefault();
      e.stopPropagation();
      const path = img.getAttribute("data-cms-path") ?? "";
      const el = (img.tagName === "IMG" ? img : img.querySelector("img")) as HTMLImageElement | null;
      this.h.pickImage(path, el ? { src: el.currentSrc || el.src, alt: el.alt } : null);
      return;
    }
    if (t.closest("a[href]")) {
      e.preventDefault();
      if (!t.closest("[contenteditable]")) this.h.notice("Mientras editás, los enlaces están en pausa.");
    }
  }

  private onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    const inField = target.closest?.("[contenteditable],input,textarea,select");
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey && !inField) {
      e.preventDefault();
      this.h.undo();
    }
    if ((e.key === "Enter" || e.key === " ") && target.matches?.('[data-cms-kind="image"]')) {
      e.preventDefault();
      target.click();
    }
  }
}
