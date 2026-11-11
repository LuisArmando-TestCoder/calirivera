"use client";
import { embedded } from "@/lib/embed";
import { useEffect } from "react";
import type { TitleFx } from "./title-fluid";

const SEL = "main h1, main h2, main [data-title-fx]";

/**
 * Los títulos grandes (y los lemas a toda página, como «Una vida dedicada…» del inicio) se pueden «tocar» con el fuego: al pasar el puntero por uno, pasa a
 * la GPU y el aire de la antorcha lo despeina. Todos comparten un solo lienzo del tamaño de la pantalla, así el
 * aire no se corta en el borde de ningún título. Solo con mouse, y solo mientras se juega (después se desarma).
 * No corre con movimiento reducido, en equipos débiles, ni mientras se edita.
 */
export function TitlePlay() {
  useEffect(() => {
    if (embedded()) return;
    const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown };
    const weak = (nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2;
    if (!nav.gpu || weak || !matchMedia("(pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let fx: TitleFx | null = null;
    let starting: HTMLElement | null = null;
    let lastMove: PointerEvent | null = null;
    // al terminar, la copia se funde con el título real; nunca desaparece de golpe
    const stop = (soft = true) => {
      fx?.stop(soft);
      fx = null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      lastMove = e;
      fx?.poke(e);
      if (starting || document.documentElement.classList.contains("cms-editing")) return;
      const hit = (e.target as Element).closest?.<HTMLElement>(SEL);
      // los estandartes «Cali Rivera» del inicio no se tocan
      const el = hit && !hit.closest('dialog, [data-fx="off"]') && parseFloat(getComputedStyle(hit).fontSize) >= (hit.hasAttribute("data-title-fx") ? 26 : 40) ? hit : null;
      if (!el) return;
      if (fx) {
        // otro título: entra al mismo lienzo; si quedó fuera de él (se desplazó la página), se arma uno nuevo
        if (fx.fits(el)) return fx.add(el);
        stop();
      }
      starting = el;
      import("./title-fluid")
        .then(({ startTitleFluid }) => startTitleFluid(el, () => stop()))
        .then((h) => {
          fx = h;
          if (lastMove) h.poke(lastMove);
        })
        .catch(() => {})
        .finally(() => (starting = null));
    };
    // solo si el título se movió de verdad (la copia ya no calza) se devuelve a la página
    const reset = () => {
      if (fx?.moved()) stop();
    };
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("resize", reset);
    addEventListener("headings:fit", reset);
    const onPop = () => stop();
    addEventListener("popstate", onPop);
    const onClick = () => setTimeout(() => stop(), 0); // navegación
    addEventListener("click", onClick, true);
    // el lienzo viaja con la página, pero si se desplazó más de media pantalla ya no cubre lo que se ve
    let y0 = scrollY;
    const onScroll = () => {
      if (!fx) return void (y0 = scrollY);
      if (Math.abs(scrollY - y0) > innerHeight * 0.5) stop();
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      removeEventListener("pointermove", onMove);
      removeEventListener("resize", reset);
      removeEventListener("headings:fit", reset);
      removeEventListener("popstate", onPop);
      removeEventListener("click", onClick, true);
      removeEventListener("scroll", onScroll);
      stop(false);
    };
  }, []);
  return null;
}
