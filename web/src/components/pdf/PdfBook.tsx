"use client";
/**
 * Un PDF como libro: páginas dibujadas a demanda en <canvas>, a doble página en pantallas anchas
 * (portada sola, después pliegos), con contador, zoom y teclado. Las páginas lejanas se liberan
 * para que un catálogo de 130 páginas no se coma la memoria del teléfono.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BookHandle } from "./book3d";
import { openPdf } from "./pdf-core";
import type { Doc, Page, RenderTask } from "./pdfjs-types";
import s from "./pdf.module.scss";

type Props = { url: string; title: string; mode: "dialog" | "inline"; onClose?: () => void; onExpand?: () => void };

const ZOOMS = [0.75, 1, 1.35, 1.75, 2.25];

export function PdfBook({ url, title, mode, onClose, onExpand }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [ratio, setRatio] = useState(1.414); // alto/ancho de la portada, para reservar el lugar de cada página
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [spread, setSpread] = useState(false);
  const [wide, setWide] = useState(false);
  // «libro»: el catálogo en 3D (book3d.ts); «páginas»: la lectura en columna. El libro es para pantallas anchas.
  const [view, setView] = useState<"book" | "pages">(() =>
    mode === "dialog" && typeof window !== "undefined" && innerWidth >= 560 && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "book" : "pages",
  );
  const [bookState, setBookState] = useState<{ left: number | null; right: number | null }>({ left: null, right: 1 });
  const bookHost = useRef<HTMLDivElement>(null);
  const book = useRef<BookHandle | null>(null);

  // abrir el documento (en pdf.js 6 se libera con la tarea de carga: el documento ya no tiene destroy())
  useEffect(() => {
    let alive = true;
    let destroyTask: (() => Promise<void>) | null = null;
    openPdf(url, (p) => alive && setProgress(p))
      .then(async ({ task, doc: pr }) => {
        destroyTask = () => task.destroy();
        const d = (await pr) as unknown as Doc;
        if (!alive) return;
        const p1 = await d.getPage(1);
        const vp = p1.getViewport({ scale: 1 });
        if (!alive) return;
        setRatio(vp.height / vp.width);
        setWide(vp.width > vp.height);
        setDoc(d);
      })
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => {
      alive = false;
      void destroyTask?.().catch(() => {});
    };
  }, [url]);

  // doble página en pantallas anchas, si las páginas son verticales
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSpread(!wide && el.clientWidth > 900));
    ro.observe(el);
    return () => ro.disconnect();
  }, [wide]);

  const n = doc?.numPages ?? 0;
  // pliegos: [1] [2,3] [4,5] … (como un libro abierto: la portada va sola, a la derecha)
  const rows = useMemo(() => {
    if (!n) return [] as number[][];
    if (!spread) return Array.from({ length: n }, (_, i) => [i + 1]);
    const r: number[][] = [[1]];
    for (let p = 2; p <= n; p += 2) r.push(p + 1 <= n ? [p, p + 1] : [p]);
    return r;
  }, [n, spread]);

  // el libro 3D (se carga three/webgpu recién acá)
  useEffect(() => {
    const host = bookHost.current;
    if (view !== "book" || !doc || !host) return;
    let alive = true;
    let h: BookHandle | null = null;
    import("./book3d")
      .then(({ startBook }) => startBook(host, doc, { aspect: ratio, onState: (st) => alive && setBookState(st), onFail: () => alive && setView("pages") }))
      .then((handle) => {
        if (!alive) return handle.destroy();
        h = handle;
        book.current = handle;
        host.querySelector("canvas")?.focus();
      })
      .catch(() => alive && setView("pages"));
    return () => {
      alive = false;
      book.current = null;
      h?.destroy();
    };
  }, [view, doc, ratio]);

  // dibujo a demanda
  const pages = useRef(new Map<number, { canvas: HTMLCanvasElement; task?: RenderTask; drawn: number; page?: Page }>());
  const draw = useCallback(
    async (num: number, canvas: HTMLCanvasElement) => {
      if (!doc) return;
      const prev = pages.current.get(num);
      // la figura se vuelve a montar al pasar de una a dos páginas: canvas nuevo, se dibuja de cero
      const rec = prev && prev.canvas === canvas ? prev : { canvas, drawn: 0, page: prev?.page };
      pages.current.set(num, rec);
      const cssW = canvas.parentElement!.clientWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const target = Math.round(cssW * dpr);
      if (rec.drawn && Math.abs(rec.drawn - target) < 8) return;
      rec.task?.cancel();
      const page = rec.page ?? (rec.page = await doc.getPage(num));
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: target / base.width });
      const off = document.createElement("canvas");
      off.width = Math.round(viewport.width);
      off.height = Math.round(viewport.height);
      const task = page.render({ canvas: off, viewport, background: "#fff" });
      rec.task = task;
      try {
        await task.promise;
      } catch {
        return; // cancelada
      }
      // cambio atómico: no hay parpadeo blanco al hacer zoom
      canvas.width = off.width;
      canvas.height = off.height;
      canvas.getContext("2d")!.drawImage(off, 0, 0);
      canvas.parentElement!.style.aspectRatio = `${base.width} / ${base.height}`;
      canvas.parentElement!.dataset.ready = "";
      rec.drawn = target;
    },
    [doc],
  );

  useEffect(() => {
    const el = scroller.current;
    if (!el || !doc) return;
    const map = pages.current;
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          const num = Number((e.target as HTMLElement).dataset.page);
          const canvas = e.target.querySelector("canvas")!;
          if (e.isIntersecting) void draw(num, canvas);
          else {
            // lejos: liberar memoria (se vuelve a dibujar al volver)
            const rec = map.get(num);
            if (rec) {
              rec.task?.cancel();
              rec.page?.cleanup();
              rec.canvas.width = rec.canvas.height = 0;
              delete (e.target as HTMLElement).dataset.ready;
              map.delete(num);
            }
          }
        }
      },
      { root: el, rootMargin: "120% 0px" },
    );
    el.querySelectorAll("[data-page]").forEach((p) => io.observe(p));
    // página actual: la que cruza el centro
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const mid = el.getBoundingClientRect().top + el.clientHeight / 2;
        let best = 1;
        let bestD = Infinity;
        el.querySelectorAll<HTMLElement>("[data-page]").forEach((p) => {
          const r = p.getBoundingClientRect();
          const d = Math.abs(r.top + r.height / 2 - mid);
          if (d < bestD) {
            bestD = d;
            best = Number(p.dataset.page);
          }
        });
        setCurrent(best);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [doc, rows, draw]);

  // al cambiar zoom o pliegos, redibujar lo visible a la nueva resolución
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const t = setTimeout(() => {
      for (const [num, rec] of pages.current) if (rec.canvas.isConnected) void draw(num, rec.canvas);
    }, 120);
    return () => clearTimeout(t);
  }, [zoom, spread, draw]);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (view === "book") {
        if (dir === 1) book.current?.next();
        else book.current?.prev();
        return;
      }
      const el = scroller.current;
      if (!el) return;
      const ri = rows.findIndex((r) => r.includes(current));
      const target = rows[Math.max(0, Math.min(rows.length - 1, ri + dir))]?.[0];
      el.querySelector<HTMLElement>(`[data-page="${target}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    },
    [rows, current, view],
  );

  // teclado (en el diálogo, o con el foco dentro del lector incrustado)
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      go(-1);
    }
    else if (e.key === " " && view === "book") {
      e.preventDefault();
      go(e.shiftKey ? -1 : 1);
    } else if (view === "book" && (e.key === "+" || e.key === "=")) book.current?.zoomBy(1.4);
    else if (view === "book" && e.key === "-") book.current?.zoomBy(1 / 1.4);
    else if (view === "book" && e.key === "0") book.current?.zoomBy(0);
    else if (e.key === "+" || e.key === "=") setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)]);
    else if (e.key === "-") setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)]);
  };

  const label =
    view === "book"
      ? [bookState.left, bookState.right].filter(Boolean).join("–") || "—"
      : spread && current > 1
        ? rows.find((r) => r.includes(current))?.join("–")
        : String(current);
  return (
    <div className={s.book} data-mode={mode} onKeyDown={onKey}>
      <div className={s.bar}>
        <p className={s.name} title={title}>
          {title}
        </p>
        <p className={s.counter} aria-live="polite">
          {n ? (
            <>
              <span>{label}</span> / {n}
            </>
          ) : error ? (
            "No se pudo abrir"
          ) : (
            `Abriendo… ${Math.round(progress * 100)}%`
          )}
        </p>
        <div className={s.tools}>
          <button type="button" onClick={() => go(-1)} aria-label="Página anterior" disabled={!n}>
            ←
          </button>
          <button type="button" onClick={() => go(1)} aria-label="Página siguiente" disabled={!n}>
            →
          </button>
          {view === "pages" && (
            <>
              <button type="button" onClick={() => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)])} aria-label="Alejar" disabled={zoom === ZOOMS[0]}>
                −
              </button>
              <button type="button" onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)])} aria-label="Acercar" disabled={zoom === ZOOMS.at(-1)}>
                +
              </button>
            </>
          )}
          {mode === "dialog" && (
            <button type="button" className={s.text} aria-pressed={view === "book"} onClick={() => setView((v) => (v === "book" ? "pages" : "book"))}>
              {view === "book" ? "Ver páginas" : "Ver como libro"}
            </button>
          )}
          {onExpand && (
            <button type="button" onClick={onExpand} className={s.text}>
              Pantalla completa
            </button>
          )}
          <a href={url} download className={s.text}>
            Descargar
          </a>
          {onClose && (
            <button type="button" onClick={onClose} className={s.text}>
              Cerrar <kbd>Esc</kbd>
            </button>
          )}
        </div>
        {!n && !error && <i className={s.progress} style={{ transform: `scaleX(${progress})` }} aria-hidden />}
      </div>

      {view === "book" && (
        <div ref={bookHost} className={s.stage} data-lenis-prevent role="document" tabIndex={0} aria-label={`${title}, ${n} páginas. Flechas o espacio para pasar las hojas; más y menos para acercar.`}>
          {!doc && !error && <p className={s.stageNote}>Abriendo el libro…</p>}
          {doc && (
            <>
              <p className={s.stageHint} aria-hidden>
                <span className={s.hintFine}>Arrastrá una hoja o tocá su borde para pasarla · doble clic para acercar · rueda para hojear</span>
                <span className={s.hintCoarse}>Deslizá para pasar la hoja · doble toque o pellizco para acercar</span>
              </p>
              <div className={s.stageZoom} role="group" aria-label="Acercar el libro">
                <button type="button" onClick={() => book.current?.zoomBy(1 / 1.5)} aria-label="Alejar">
                  −
                </button>
                <button type="button" onClick={() => book.current?.zoomBy(0)} aria-label="Ver el libro entero">
                  ⤢
                </button>
                <button type="button" onClick={() => book.current?.zoomBy(1.5)} aria-label="Acercar">
                  +
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <div ref={scroller} className={s.scroll} hidden={view === "book"} data-lenis-prevent tabIndex={0} aria-label={`${title}, ${n} páginas`} role="document">
        {error && (
          <p className={s.error}>
            No se pudo mostrar el PDF acá. <a href={url}>Abrilo directamente</a>.
          </p>
        )}
        <div className={s.pages} data-spread={spread ? "" : undefined} style={{ "--zoom": zoom, "--ratio": ratio } as React.CSSProperties}>
          {rows.map((r) => (
            <div key={r.join("-")} className={s.row} data-single={r.length === 1 ? "" : undefined} data-cover={r[0] === 1 && spread ? "" : undefined}>
              {r.map((p) => (
                <figure key={p} className={s.page} data-page={p} role="img" aria-label={`Página ${p} de ${n}`}>
                  <canvas />
                  <span className={s.pageNo} aria-hidden>
                    {p}
                  </span>
                </figure>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
