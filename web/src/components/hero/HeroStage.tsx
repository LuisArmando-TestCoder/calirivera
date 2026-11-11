"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import s from "./Banners.module.scss";

export type StageSlide = { src: string; w: number; h: number; title: string; period?: string; href: string };

/**
 * Escenario detrás de los estandartes: las exposiciones pasan quemándose al revés (WebGPU, ver burn.ts).
 * Sin GPU, con movimiento reducido o en equipos débiles no se monta y el hero queda como siempre (papel claro).
 * Cuando arranca marca el <section> con data-stage para que el resto del hero cambie a colores de escena.
 */
export function HeroStage({ slides }: { slides: StageSlide[] }) {
  const host = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = host.current;
    const hero = el?.closest("section");
    if (!el || !hero || slides.length === 0) return;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const weak = (nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2 || nav.connection?.saveData === true;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || weak) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    const go = (forceWebGL: boolean): Promise<void> =>
      import("./burn")
        .then(({ startHeroBurn }) =>
          startHeroBurn(el, slides, {
            forceWebGL,
            onSlide: (k) => setI(k),
            onReady: () => {
              hero.dataset.stage = "on";
              setOn(true);
            },
          }),
        )
        .then((h) => {
          if (cancelled) return h.stop();
          stop = h.stop;
        })
        .catch((err) => {
          if (!forceWebGL && !cancelled) return go(true);
          console.warn("[hero] sin escenario GPU:", err);
        });
    // después de la primera pintura: el LCP es el texto de los estandartes, no esto
    const idle = "requestIdleCallback" in window ? requestIdleCallback(() => void go(false), { timeout: 1200 }) : setTimeout(() => void go(false), 600);
    return () => {
      cancelled = true;
      if ("cancelIdleCallback" in window) cancelIdleCallback(idle as number);
      else clearTimeout(idle as number);
      stop?.();
      delete hero.dataset.stage;
    };
  }, [slides]);

  const cur = slides[i];
  return (
    <>
      <div ref={host} className={s.stage} aria-hidden />
      {on && cur && (
        <Link href={cur.href} className={s.stageCaption} key={cur.href}>
          <span className={s.stageCount}>
            {String(i + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
          </span>
          <span className={s.stageTitle}>{cur.title}</span>
          {cur.period && <span className={s.stagePeriod}>{cur.period}</span>}
        </Link>
      )}
    </>
  );
}
