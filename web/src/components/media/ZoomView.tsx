"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ImageAsset } from "@/lib/content/types";
import s from "./zoom.module.scss";

const best = (img: ImageAsset) => {
  const w = img.widths?.slice().sort((a, b) => b - a)[0];
  return w && /-\d+\.jpg$/.test(img.src) ? img.src.replace(/-\d+\.jpg$/, `-${w}.webp`) : img.src;
};

/**
 * La obra de cerca: tocar la imagen (o «Ver de cerca») la abre a pantalla completa para recorrerla.
 * Rueda o pellizco para acercar, arrastrar para moverse, doble toque para acercar/volver, + − 0 y flechas con
 * el teclado, Esc para cerrar. Es un <dialog> nativo: queda por encima de todo y atrapa el foco.
 */
export function ZoomView({ image, label, children }: { image: ImageAsset; label: string; children: ReactNode }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [open, setOpen] = useState(false);
  const view = useRef({ s: 1, x: 0, y: 0 });
  const [pct, setPct] = useState(100);
  const max = Math.max(4, Math.min(8, ((image.width ?? 1200) / 500) * 2));

  const apply = useCallback(() => {
    const el = img.current;
    const st = stage.current;
    if (!el || !st) return;
    const v = view.current;
    // no dejar que la obra se pierda de vista
    const bw = (el.offsetWidth * v.s - st.clientWidth) / 2;
    const bh = (el.offsetHeight * v.s - st.clientHeight) / 2;
    v.x = Math.max(-Math.max(0, bw), Math.min(Math.max(0, bw), v.x));
    v.y = Math.max(-Math.max(0, bh), Math.min(Math.max(0, bh), v.y));
    el.style.transform = `translate3d(${v.x.toFixed(1)}px, ${v.y.toFixed(1)}px, 0) scale(${v.s.toFixed(3)})`;
    if (v.s > 1.01) st.dataset.zoomed = "";
    else delete st.dataset.zoomed;
    setPct(Math.round(v.s * 100));
  }, []);

  /** acercar manteniendo fijo el punto (cx, cy) de la pantalla */
  const zoomAt = useCallback(
    (next: number, cx?: number, cy?: number) => {
      const st = stage.current;
      if (!st) return;
      const v = view.current;
      const r = st.getBoundingClientRect();
      const px = (cx ?? r.left + r.width / 2) - (r.left + r.width / 2);
      const py = (cy ?? r.top + r.height / 2) - (r.top + r.height / 2);
      const s2 = Math.max(1, Math.min(max, next));
      const k = s2 / v.s;
      v.x = px - (px - v.x) * k;
      v.y = py - (py - v.y) * k;
      v.s = s2;
      if (s2 === 1) v.x = v.y = 0;
      apply();
    },
    [apply, max],
  );

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) {
      view.current = { s: 1, x: 0, y: 0 };
      d.showModal();
      requestAnimationFrame(apply);
    }
    if (!open && d.open) d.close();
  }, [open, apply]);
  useEffect(() => {
    const d = dlg.current;
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  useEffect(() => {
    const st = stage.current;
    if (!st || !open) return;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    let moved = 0;
    let lastTap = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(view.current.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0022)), e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => {
      st.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) zoomAt((view.current.s * d) / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = d;
        return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      if (view.current.s > 1) {
        view.current.x += dx;
        view.current.y += dy;
        apply();
      }
    };
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = 0;
      if (moved < 6 && pts.size === 0) {
        // doble toque / doble clic: acercar donde se tocó, o volver
        const now = performance.now();
        if (now - lastTap < 320) zoomAt(view.current.s > 1.01 ? 1 : Math.min(max, 2.6), e.clientX, e.clientY);
        lastTap = now;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const step = 80;
      if (e.key === "+" || e.key === "=") zoomAt(view.current.s * 1.4);
      else if (e.key === "-") zoomAt(view.current.s / 1.4);
      else if (e.key === "0") zoomAt(1);
      else if (e.key.startsWith("Arrow") && view.current.s > 1) {
        view.current.x += e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0;
        view.current.y += e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
        apply();
      } else return;
      e.preventDefault();
    };
    st.addEventListener("wheel", onWheel, { passive: false });
    st.addEventListener("pointerdown", onDown);
    st.addEventListener("pointermove", onMove);
    st.addEventListener("pointerup", onUp);
    st.addEventListener("pointercancel", onUp);
    const d = dlg.current;
    d?.addEventListener("keydown", onKey);
    return () => {
      st.removeEventListener("wheel", onWheel);
      st.removeEventListener("pointerdown", onDown);
      st.removeEventListener("pointermove", onMove);
      st.removeEventListener("pointerup", onUp);
      st.removeEventListener("pointercancel", onUp);
      d?.removeEventListener("keydown", onKey);
    };
  }, [open, zoomAt, apply, max]);

  return (
    <>
      <div
        className={s.trigger}
        onClick={(e) => {
          // con el editor abierto, tocar la foto es para cambiarla
          if (document.documentElement.classList.contains("cms-editing")) return;
          if ((e.target as HTMLElement).closest("a")) return;
          setOpen(true);
        }}
      >
        {children}
        <button type="button" className={s.open} onClick={() => setOpen(true)} aria-label={`Ver de cerca: ${label}`}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M15.5 15.5 21 21M10.5 7.8v5.4M7.8 10.5h5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          </svg>
          Ver de cerca
        </button>
      </div>
      <dialog ref={dlg} className={s.dialog} aria-label={`${label}, vista de cerca`} onClose={() => setOpen(false)} data-lenis-prevent>
        {open && (
          <>
            <div ref={stage} className={s.stage}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={img} src={best(image)} alt={image.alt} width={image.width} height={image.height} draggable={false} onLoad={apply} />
            </div>
            <div className={s.tools} role="toolbar" aria-label="Acercar y alejar">
              <button type="button" onClick={() => zoomAt(view.current.s / 1.5)} aria-label="Alejar" disabled={pct <= 100}>
                −
              </button>
              <button type="button" className={s.pct} onClick={() => zoomAt(1)} aria-label={`Zoom ${pct} por ciento. Volver a ver la obra entera`}>
                {pct}%
              </button>
              <button type="button" onClick={() => zoomAt(view.current.s * 1.5)} aria-label="Acercar" disabled={pct >= Math.round(max * 100)}>
                +
              </button>
            </div>
            <p className={s.hint} aria-hidden>
              Rueda o pellizco para acercar · arrastrá para recorrer · doble toque para volver
            </p>
            <button type="button" className={s.close} onClick={() => setOpen(false)} aria-label="Cerrar la vista de cerca">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
              </svg>
            </button>
          </>
        )}
      </dialog>
    </>
  );
}
