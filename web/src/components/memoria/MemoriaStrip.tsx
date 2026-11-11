"use client";
/**
 * Cinta de recuerdos de la home (McCormack): una sola fila, mucho aire, que deriva sola y sin fin.
 * El scroll de la página la acelera (y la tela se dobla con la velocidad); se puede arrastrar.
 * La capa WebGPU es la misma de /memoria (modo «live»: mide en cada cuadro porque la cinta se mueve),
 * y se carga recién cuando la cinta está por entrar en pantalla.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { hoverLabel } from "./hover-label";
import s from "./teaser.module.scss";

export function MemoriaStrip({ children }: { children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);

  // deriva + scroll + arrastre
  useEffect(() => {
    const el = wrap.current;
    const tr = track.current;
    if (!el || !tr) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let x = 0;
    let v = 0;
    let half = tr.scrollWidth / 2;
    let raf = 0;
    let visible = false;
    let hover = false;
    let drag: { x: number; id: number; moved: number } | null = null;
    let lastY = scrollY;
    const ro = new ResizeObserver(() => (half = tr.scrollWidth / 2));
    ro.observe(tr);
    const loop = () => {
      raf = 0;
      if (!visible) return;
      const dy = scrollY - lastY;
      lastY = scrollY;
      const base = reduced || hover ? 0 : 0.45;
      v += (base + dy * 0.6 - v) * (drag ? 0 : 0.08);
      if (!drag) x -= v;
      if (half > 0) x = ((x % half) - half) % half;
      tr.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
      raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      lastY = scrollY;
      if (visible && !raf) raf = requestAnimationFrame(loop);
    });
    io.observe(el);
    const onEnter = () => (hover = true);
    const onLeave = () => (hover = false);
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, id: e.pointerId, moved: 0 };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      drag.x = e.clientX;
      drag.moved += Math.abs(dx);
      if (drag.moved > 6 && !el.hasPointerCapture(e.pointerId)) {
        el.setPointerCapture(e.pointerId);
        el.dataset.dragging = "";
      }
      x += dx;
      v = -dx;
    };
    const onUp = (e: PointerEvent) => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      delete el.dataset.dragging;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      // si se arrastró, el clic no abre la foto
      if (moved > 6) el.addEventListener("click", (c) => c.preventDefault(), { capture: true, once: true });
    };
    // teclado: al enfocar una foto (incluso un clon), que quede a la vista
    const onFocus = (e: FocusEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>("[data-mem]");
      if (!a) return;
      const r = a.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      if (r.left < er.left || r.right > er.right) x += er.left + er.width / 2 - (r.left + r.width / 2);
    };
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("focusin", onFocus);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("focusin", onFocus);
    };
  }, []);

  // título en itálica
  useEffect(() => {
    if (!wrap.current || !label.current || matchMedia("(pointer: coarse)").matches) return;
    return hoverLabel(wrap.current, label.current, { moving: true });
  }, []);

  // capa WebGPU: cuando la cinta está por llegar
  useEffect(() => {
    const el = wrap.current;
    const gl = layer.current;
    if (!el || !gl) return;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const weak = (nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2 || nav.connection?.saveData === true;
    let fxOff = false;
    try {
      fxOff = localStorage.getItem("memoria-fx") === "off";
    } catch {}
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || weak || fxOff || document.cookie.includes("cr_admin=1")) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    const go = (forceWebGL: boolean) =>
      import("./gl")
        .then(({ startMemoriaGL }) => startMemoriaGL(el, gl, { live: true, slot: 512, forceWebGL }))
        .then((h) => {
          if (cancelled) return h.stop();
          stop = h.stop;
          h.onFail((why) => {
            stop = undefined;
            if (h.backend === "webgpu" && why.startsWith("error") && !cancelled) void go(true);
          });
        })
        .catch(() => {});
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        void go(false);
      },
      { rootMargin: "100% 0px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      stop?.();
    };
  }, []);

  return (
    <div ref={wrap} className={s.stripWrap}>
      <div ref={layer} className={s.glLayer} aria-hidden />
      <div ref={label} className={s.hoverLabel} aria-hidden />
      <div ref={track} className={s.track}>
        {children}
      </div>
    </div>
  );
}
