"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { InlineOp } from "@/lib/cms/ops";
import { parsePath } from "@/lib/cms/paths";
import type { ImageAsset } from "@/lib/content/types";
import {
  inlineDiscardDraftAction,
  inlineLoadDraftAction,
  inlinePublishAction,
  inlineSaveDraftAction,
  whoAmIAction,
} from "@/app/admin/actions";
import { ImageSheet, type ArtworkMeta } from "../shared/ImageSheet";
import { Confirm } from "../shared/Sheet";
import { Toaster, useToast } from "../shared/Toaster";
import { applyDom, itemDocId, listItems, type Undo } from "./dom";
import { EditSession, type ListCtx } from "./session";
import { ItemSheet, type NewItem } from "./ItemSheet";
import { EDIT_CSS } from "./editCss";
import o from "./overlay.module.scss";

type Entry = { op: InlineOp; undo: Undo };

let tempSeq = 0;
const tempId = () => `__nuevo-${Date.now().toString(36)}-${++tempSeq}`;

export default function EditorOverlay() {
  return (
    <Toaster>
      <Overlay />
    </Toaster>
  );
}

function Overlay() {
  const pathname = usePathname();
  const toast = useToast();
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const entriesRef = useRef<Entry[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const savedRef = useRef(0);
  const [busy, setBusy] = useState<"" | "draft" | "publish">("");
  const [draft, setDraft] = useState<{ ops: InlineOp[]; savedAt: string } | null>(null);
  const [imageFor, setImageFor] = useState<{ path: string; initial: ImageAsset | null; insert?: ListCtx } | null>(null);
  const [itemFor, setItemFor] = useState<ListCtx | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ ctx: ListCtx; item: HTMLElement } | null>(null);
  const session = useRef<EditSession | null>(null);

  const setSaved = (n: number) => {
    savedRef.current = n;
    setSavedCount(n);
  };

  const commit = useCallback((op: InlineOp) => {
    let undo: Undo = () => {};
    try {
      undo = applyDom(op);
    } catch (e) {
      console.warn("[cms] preview failed", e);
    }
    entriesRef.current = [...entriesRef.current, { op, undo }];
    setEntries(entriesRef.current);
    requestAnimationFrame(() => session.current?.scan());
  }, []);

  const undo = useCallback(() => {
    const cur = entriesRef.current;
    const last = cur[cur.length - 1];
    if (!last) return;
    try {
      last.undo();
    } catch {}
    entriesRef.current = cur.slice(0, -1);
    setEntries(entriesRef.current);
    if (savedRef.current > entriesRef.current.length) {
      savedRef.current = entriesRef.current.length;
      setSavedCount(savedRef.current);
    }
    requestAnimationFrame(() => {
      session.current?.scan();
      session.current?.refreshTools();
    });
  }, []);

  const enter = useCallback(async () => {
    const s = new EditSession({
      commit,
      undo,
      pickImage: (path, initial, insert) => setImageFor({ path, initial, insert }),
      addItem: (ctx) => setItemFor(ctx),
      askDelete: (ctx, item) => setConfirmDelete({ ctx, item }),
      notice: (text) => toast({ text }),
    });
    session.current = s;
    setEditing(true);
    requestAnimationFrame(() => s.start());
    try {
      const d = await inlineLoadDraftAction(pathname);
      if (d?.ops?.length) setDraft(d);
    } catch {}
  }, [commit, undo, toast, pathname]);

  // Confirm the real session once; reopen edit mode after a publish reload (?editar).
  const enterRef = useRef(enter);
  useEffect(() => {
    enterRef.current = enter;
  }, [enter]);
  useEffect(() => {
    let alive = true;
    whoAmIAction().then((me) => {
      if (!alive || !me) return;
      setReady(true);
      const url = new URL(window.location.href);
      if (url.searchParams.has("editar")) {
        url.searchParams.delete("editar");
        window.history.replaceState(null, "", url);
        // Let React finish hydrating the page before touching its DOM.
        const go = () => setTimeout(() => alive && enterRef.current(), 400);
        if (document.readyState === "complete") go();
        else window.addEventListener("load", go, { once: true });
      }
    });
    return () => {
      alive = false;
      session.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!editing) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      if (entriesRef.current.length > savedRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [editing]);

  const ops = entries.map((e) => e.op);
  const unsaved = entries.length - savedCount;

  async function saveDraft() {
    setBusy("draft");
    const r = await inlineSaveDraftAction(pathname, entriesRef.current.map((e) => e.op));
    setBusy("");
    if (r.ok) {
      setSaved(entriesRef.current.length);
      toast({ text: "Borrador guardado. No se ve en el sitio hasta que publiques.", tone: "ok" });
    } else toast({ text: ("error" in r && r.error) || "No se pudo guardar", tone: "error" });
  }

  async function publish() {
    if (!ops.length) return;
    setBusy("publish");
    const r = await inlinePublishAction(pathname, ops);
    if (!r.ok) {
      setBusy("");
      toast({ text: ("error" in r && r.error) || "No se pudo publicar", tone: "error", ms: 8000 });
      return;
    }
    toast({ text: "¡Publicado! Actualizando la página…", tone: "ok" });
    savedRef.current = entriesRef.current.length;
    setTimeout(() => {
      const u = new URL(window.location.href);
      u.searchParams.set("editar", "");
      window.location.replace(u.toString());
    }, 700);
  }

  function exit() {
    if (unsaved > 0) return setConfirmExit(true);
    if (entries.length) return window.location.reload();
    session.current?.stop();
    session.current = null;
    setEditing(false);
    setDraft(null);
  }

  function continueDraft() {
    if (!draft) return;
    for (const op of draft.ops) commit(op);
    setSaved(entriesRef.current.length);
    setDraft(null);
  }

  async function discardDraft() {
    await inlineDiscardDraftAction(pathname);
    setDraft(null);
    toast({ text: "Borrador descartado." });
  }

  function onImage(asset: ImageAsset, extra: { artwork?: ArtworkMeta }) {
    const target = imageFor;
    setImageFor(null);
    if (!target) return;
    if (target.insert) {
      commit({ t: "insert", path: target.insert.path, index: listItems(target.insert.el).length, value: asset });
      return;
    }
    commit({ t: "set", path: target.path, value: asset });
    const p = parsePath(target.path);
    if (p?.kind === "field" && p.collection === "artworks" && extra.artwork) {
      for (const [k, v] of Object.entries(extra.artwork)) if (v?.trim()) commit({ t: "set", path: `artworks/${p.docId}#${k}`, value: v.trim() });
    }
  }

  function onItem(item: NewItem) {
    const ctx = itemFor;
    setItemFor(null);
    if (!ctx) return;
    if (item.kind === "doc") {
      commit({ t: "create", collection: item.collection, tempId: tempId(), value: item.value });
      return;
    }
    let index = listItems(ctx.el).length;
    for (const v of item.values) commit({ t: "insert", path: ctx.path, index: index++, value: v });
  }

  function onDelete() {
    const d = confirmDelete;
    setConfirmDelete(null);
    if (!d) return;
    const { ctx, item } = d;
    if (ctx.collection) {
      const id = itemDocId(item, ctx.collection);
      if (id) commit({ t: "trash", collection: ctx.collection, id });
    } else commit({ t: "remove", path: ctx.path, index: listItems(ctx.el).indexOf(item) });
  }

  if (!ready || pathname.startsWith("/admin")) return null;
  const imgPath = imageFor ? parsePath(imageFor.path) : null;

  return (
    <>
      <style>{EDIT_CSS}</style>
      {!editing ? (
        <div className={o.idle} data-cms-bar>
          <button type="button" className={o.editBtn} onClick={enter}>
            <span aria-hidden>✎</span> Editar esta página
          </button>
          <Link className={o.panelLink} href="/admin">
            Panel
          </Link>
        </div>
      ) : (
        <div className={o.bar} data-cms-bar role="toolbar" aria-label="Edición de la página">
          {draft ? (
            <div className={o.draftBanner}>
              <span>
                Tenés {draft.ops.length} cambio{draft.ops.length === 1 ? "" : "s"} guardado{draft.ops.length === 1 ? "" : "s"} como borrador.
              </span>
              <button type="button" className={o.btnPrimary} onClick={continueDraft}>
                Seguir con el borrador
              </button>
              <button type="button" className={o.btn} onClick={discardDraft}>
                Descartar
              </button>
            </div>
          ) : (
            <p className={o.status} aria-live="polite">
              {entries.length === 0
                ? "Tocá un texto para cambiarlo, o una foto para reemplazarla."
                : unsaved > 0
                  ? `${entries.length} cambio${entries.length === 1 ? "" : "s"} sin publicar`
                  : "Borrador guardado · falta publicar"}
            </p>
          )}
          <div className={o.actions}>
            <button type="button" className={o.btn} onClick={undo} disabled={!entries.length || !!busy}>
              ↶ Deshacer
            </button>
            <button type="button" className={o.btn} onClick={saveDraft} disabled={!entries.length || !!busy || unsaved === 0}>
              {busy === "draft" ? "Guardando…" : "Guardar borrador"}
            </button>
            <button type="button" className={o.btnPrimary} onClick={publish} disabled={!entries.length || !!busy}>
              {busy === "publish" ? "Publicando…" : "Publicar"}
            </button>
            <button type="button" className={o.btnGhost} onClick={exit} disabled={!!busy}>
              Salir
            </button>
          </div>
        </div>
      )}

      <ImageSheet
        open={!!imageFor}
        initial={imageFor?.initial ?? null}
        title={imageFor?.insert ? "Agregar foto" : "Cambiar foto"}
        askArtwork={imgPath?.kind === "field" && imgPath.collection === "artworks"}
        onClose={() => setImageFor(null)}
        onDone={onImage}
      />
      <ItemSheet open={!!itemFor} itemType={itemFor?.itemType ?? "block"} onClose={() => setItemFor(null)} onDone={onItem} />
      <Confirm
        open={!!confirmDelete}
        title="¿Quitar este elemento?"
        body={<p>{confirmDelete?.ctx.collection ? "Va a la papelera: lo podés recuperar desde el panel." : "Lo podés deshacer antes de publicar."}</p>}
        confirmLabel="Quitar"
        danger
        onClose={() => setConfirmDelete(null)}
        onConfirm={onDelete}
      />
      <Confirm
        open={confirmExit}
        title="Tenés cambios sin guardar"
        body={<p>¿Querés guardarlos como borrador antes de salir? Si no, se pierden.</p>}
        confirmLabel="Guardar borrador y salir"
        onClose={() => setConfirmExit(false)}
        onConfirm={async () => {
          await saveDraft();
          window.location.reload();
        }}
        extra={{ label: "Salir sin guardar", run: () => window.location.reload() }}
      />
    </>
  );
}
