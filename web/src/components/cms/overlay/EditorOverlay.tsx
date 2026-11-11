"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { InlineOp } from "@/lib/cms/ops";
import { parsePath } from "@/lib/cms/paths";
import type { ImageAsset } from "@/lib/content/types";
import { deployStatusAction, inlinePublishAction, whoAmIAction } from "@/app/admin/actions";
import { ImageSheet, type ArtworkMeta } from "../shared/ImageSheet";
import { Confirm } from "../shared/Sheet";
import { Toaster, useToast } from "../shared/Toaster";
import { applyDom, itemDocId, listItems, type Undo } from "./dom";
import { EditSession, type ListCtx } from "./session";
import { ItemSheet, type NewItem } from "./ItemSheet";
import { addSending, allDrafts, CHANGE, loadDraft, outbox, saveDraft, setStates, type LocalDraft, type Sending } from "./local";
import { StatusSheet } from "./StatusSheet";
import { sign } from "@/components/brand/SignatureMoments";
import { EDIT_CSS } from "./editCss";
import o from "./overlay.module.scss";

type Entry = { op: InlineOp; undo: Undo };

/** Un documento recién creado deja de llamarse por su id provisorio: el DOM pasa a usar el id real. */
function retarget(created: Record<string, string> | undefined) {
  for (const [temp, real] of Object.entries(created ?? {}))
    document.querySelectorAll<HTMLElement>(`[data-cms-path*="/${CSS.escape(temp)}#"]`).forEach((el) => {
      el.setAttribute("data-cms-path", el.getAttribute("data-cms-path")!.replace(`/${temp}#`, `/${real}#`));
    });
}
const pageName = () => document.title.split(" · ")[0].split(":")[0].trim() || "esta página";

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
  const [busy, setBusy] = useState<"" | "publish">("");
  const [sendings, setSendings] = useState<Sending[]>([]);
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [statusOpen, setStatusOpen] = useState(false);
  const armed = useRef(false); // el guardado automático arranca después de recuperar el borrador
  const [imageFor, setImageFor] = useState<{ path: string; initial: ImageAsset | null; insert?: ListCtx } | null>(null);
  const [itemFor, setItemFor] = useState<ListCtx | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ ctx: ListCtx; item: HTMLElement } | null>(null);
  const session = useRef<EditSession | null>(null);

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
    requestAnimationFrame(() => {
      s.start();
      // Lo que quedó sin publicar en este dispositivo vuelve solo (se apagó el teléfono, se cerró la pestaña…).
      const d = loadDraft(pathname);
      if (d?.ops.length) {
        for (const op of d.ops) commit(op);
        const n = d.ops.length;
        toast({ text: `Recuperé ${n} cambio${n === 1 ? "" : "s"} que no habías publicado.`, tone: "ok", ms: 6000 });
      }
      armed.current = true;
    });
  }, [commit, undo, toast, pathname]);

  // Guardado automático en este dispositivo: cada cambio queda escrito al instante.
  useEffect(() => {
    if (editing && armed.current) saveDraft(pathname, entries.map((e) => e.op));
  }, [entries, editing, pathname]);

  // Envíos y borradores (para el indicador de estado, en todas las páginas).
  useEffect(() => {
    const sync = () => {
      setSendings(outbox());
      setDrafts(allDrafts());
    };
    sync();
    window.addEventListener(CHANGE, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Seguir cada envío hasta que esté en línea.
  const waiting = sendings.filter((s) => s.state === "sent" || s.state === "building");
  const waitKey = waiting.map((s) => s.commit).join(",");
  useEffect(() => {
    if (!ready || !waitKey) return;
    let alive = true;
    const check = async () => {
      try {
        const info = await deployStatusAction(waitKey.split(","));
        if (!alive) return;
        const before = outbox();
        setStates(info.states);
        for (const s of before) {
          const st = info.states[s.commit];
          if (st === "live" && s.state !== "live") toast({ text: `Ya está en línea: ${s.label}.`, tone: "ok", ms: 7000 });
          if (st === "failed" && s.state !== "failed") toast({ text: "Un envío no se pudo construir. Tocá el estado para ver qué pasó.", tone: "error", ms: 10000 });
        }
      } catch {}
    };
    const first = setTimeout(check, 4000);
    const t = setInterval(check, 15000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(t);
    };
  }, [ready, waitKey, toast]);

  // Lo que ya se envió pero el sitio todavía no reconstruyó se vuelve a dibujar encima de esta página.
  const replayed = useRef(new Set<string>());
  useEffect(() => {
    if (!ready) return;
    replayed.current = new Set();
    const t = setTimeout(() => {
      for (const s of outbox().slice().reverse()) {
        if (s.pathname !== pathname || s.state === "live" || replayed.current.has(s.commit)) continue;
        replayed.current.add(s.commit);
        for (const op of s.ops) {
          try {
            applyDom(op);
          } catch {}
        }
        retarget(s.created);
      }
      session.current?.scan();
    }, 600);
    return () => clearTimeout(t);
  }, [ready, pathname]);

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

  const ops = entries.map((e) => e.op);

  async function publish() {
    if (!ops.length) return;
    setBusy("publish");
    const r = await inlinePublishAction(pathname, ops);
    if (!r.ok) {
      setBusy("");
      toast({ text: ("error" in r && r.error) || "No se pudo publicar. Tus cambios siguen guardados en este dispositivo.", tone: "error", ms: 9000 });
      return;
    }
    const created = "created" in r ? r.created : undefined;
    const newPage = ops.find((o) => o.t === "create" && o.collection === "pages");
    const newHref = newPage && newPage.t === "create" && created?.[newPage.tempId] ? `/${created[newPage.tempId]}` : undefined;
    saveDraft(pathname, []);
    if (r.deploys) {
      // El sitio se reconstruye: lo enviado queda «en camino» y la página sigue mostrando el cambio.
      const n = ops.length;
      if (r.commit) addSending({ commit: r.commit, pathname, label: newHref ? `página nueva en ${pageName()}` : `${n} cambio${n === 1 ? "" : "s"} en ${pageName()}`, ops, created, href: newHref });
      retarget(created);
      entriesRef.current = [];
      setEntries([]);
      setBusy("");
      if (r.commit) sign("Enviado · en camino al sitio");
      toast({ text: r.commit ? "Enviado. El sitio se está actualizando: en unos minutos lo ve todo el mundo. Te aviso." : "No había nada nuevo para publicar.", tone: "ok", ms: 7000 });
      if (r.commit) setStatusOpen(true);
      requestAnimationFrame(() => session.current?.scan());
      return;
    }
    toast({ text: "¡Publicado! Actualizando la página…", tone: "ok" });
    sign("Publicado");
    setTimeout(() => {
      const u = new URL(newHref ?? window.location.href, window.location.href);
      u.searchParams.set("editar", "");
      window.location.replace(u.toString());
    }, 2600);
  }

  function exit() {
    // Los cambios sin publicar ya están guardados en este dispositivo: salir nunca pierde nada.
    if (entries.length) {
      toast({ text: "Tus cambios quedan guardados acá. Cuando vuelvas a editar, siguen donde los dejaste.", tone: "ok" });
      return void setTimeout(() => window.location.reload(), 900);
    }
    session.current?.stop();
    session.current = null;
    armed.current = false;
    setEditing(false);
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
      if (item.collection === "pages") toast({ text: "Página lista para crear. Tocá «Publicar» y aparece en el menú.", tone: "ok", ms: 7000 });
      return;
    }
    let index = listItems(ctx.el).length;
    for (const v of item.values) commit({ t: "insert", path: ctx.path, index: index++, value: v });
  }

  function onDelete(how: "archive" | "trash" = "trash") {
    const d = confirmDelete;
    setConfirmDelete(null);
    if (!d) return;
    const { ctx, item } = d;
    if (ctx.collection) {
      const id = itemDocId(item, ctx.collection);
      if (id) commit({ t: how, collection: ctx.collection, id });
    } else commit({ t: "remove", path: ctx.path, index: listItems(ctx.el).indexOf(item) });
  }

  if (!ready || pathname.startsWith("/admin")) return null;
  const imgPath = imageFor ? parsePath(imageFor.path) : null;

  const failed = sendings.filter((s) => s.state === "failed").length;
  const otherDrafts = drafts.filter((d) => d.pathname !== pathname || !editing);
  const chip = failed
    ? { tone: "bad", text: "Un envío falló" }
    : waiting.length
      ? { tone: "busy", text: `${waiting.length} en camino` }
      : otherDrafts.length
        ? { tone: "draft", text: `${otherDrafts.length} sin publicar` }
        : { tone: "ok", text: "Todo en línea" };
  const statusChip = (
    <button type="button" className={o.chip} data-tone={chip.tone} onClick={() => setStatusOpen(true)} aria-label={`Estado del sitio: ${chip.text}. Ver detalle`}>
      <i aria-hidden />
      {chip.text}
    </button>
  );
  const isCollectionItem = !!confirmDelete?.ctx.collection;

  return (
    <>
      <style>{EDIT_CSS}</style>
      {!editing ? (
        <div className={o.idle} data-cms-bar>
          <button type="button" className={o.editBtn} onClick={enter}>
            <span aria-hidden>✎</span> Editar esta página
          </button>
          {statusChip}
          <Link className={o.panelLink} href="/admin">
            Panel
          </Link>
        </div>
      ) : (
        <div className={o.bar} data-cms-bar role="toolbar" aria-label="Edición de la página">
          <p className={o.status} aria-live="polite">
            {entries.length === 0
              ? "Tocá un texto para cambiarlo o una foto para reemplazarla. «＋ Agregar» suma cosas nuevas."
              : `${entries.length} cambio${entries.length === 1 ? "" : "s"} guardado${entries.length === 1 ? "" : "s"} en este dispositivo · falta publicar`}
          </p>
          <div className={o.actions}>
            {statusChip}
            <button type="button" className={o.btn} onClick={undo} disabled={!entries.length || !!busy}>
              ↶ Deshacer
            </button>
            <button type="button" className={o.btn} onClick={() => setItemFor({ el: document.body, path: "pages", itemType: "page", collection: "pages" })} disabled={!!busy}>
              ＋ Página nueva
            </button>
            <button type="button" className={o.btnPrimary} onClick={publish} disabled={!entries.length || !!busy}>
              {busy === "publish" ? "Enviando…" : "Publicar"}
            </button>
            <button type="button" className={o.btnGhost} onClick={exit} disabled={!!busy}>
              Salir
            </button>
          </div>
        </div>
      )}

      <StatusSheet open={statusOpen} onClose={() => setStatusOpen(false)} sendings={sendings} drafts={drafts} here={pathname} />
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
        title={isCollectionItem ? "¿Qué hacemos con esto?" : "¿Quitar este elemento?"}
        body={
          isCollectionItem ? (
            <p>
              <strong>Archivar</strong> lo saca del sitio pero lo guarda tal cual: desde el Panel lo volvés a mostrar cuando quieras. La <strong>papelera</strong> es para lo que ya no va; también se puede recuperar desde el Panel.
            </p>
          ) : (
            <p>Lo podés deshacer antes de publicar.</p>
          )
        }
        confirmLabel={isCollectionItem ? "Archivar" : "Quitar"}
        danger={!isCollectionItem}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => onDelete(isCollectionItem ? "archive" : "trash")}
        extra={isCollectionItem ? { label: "Mandar a la papelera", run: () => onDelete("trash") } : undefined}
      />
    </>
  );
}
