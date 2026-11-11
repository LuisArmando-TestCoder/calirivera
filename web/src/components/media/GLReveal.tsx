"use client";
import { type ReactNode, useEffect, useRef } from "react";
import s from "./GLReveal.module.scss";

/**
 * Los mismos efectos de Memoria (la foto que renace de la ceniza, el calor del puntero, la tela que se dobla
 * con el scroll) para cualquier grupo de imágenes: fichas, colecciones y el visor.
 * Cada imagen participante lleva `data-mem` (ArtImage lo pone solo). Una sola capa <canvas> fija por grupo;
 * sin GPU, movimiento reducido o en modo admin, no pasa nada: se ven las imágenes normales.
 */
export function GLReveal({
  children,
  className,
  live = false,
  slot = 512,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** medir en cada cuadro (contenedores que se mueven solos o scrollean por dentro, como el visor) */
  live?: boolean;
  slot?: number;
  as?: "div" | "section" | "article";
}) {
  const root = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    const gl = layer.current;
    if (!el || !gl || !el.querySelector("[data-mem]")) return;
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
      import("@/components/memoria/gl")
        .then(({ startMemoriaGL }) => startMemoriaGL(el, gl, { live, slot, forceWebGL }))
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
      { rootMargin: "50% 0px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      stop?.();
    };
  }, [live, slot]);

  return (
    <Tag ref={root as never} className={`${s.root} ${className ?? ""}`}>
      <div ref={layer} className={s.layer} aria-hidden />
      {children}
    </Tag>
  );
}
