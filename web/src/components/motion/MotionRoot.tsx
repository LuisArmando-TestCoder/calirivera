"use client";
/**
 * Un solo loop de animación: Lenis (scroll suave) + GSAP ScrollTrigger en el ticker de GSAP.
 * Lee atributos declarativos del DOM, así los componentes de servidor no cargan JS:
 *   data-reveal="lines"   → las líneas del texto suben desde una máscara (SplitText)
 *   data-reveal="fade"    → aparece al entrar
 *   data-parallax="0.15"  → desplazamiento vertical relativo al scroll (solo imágenes/fondos)
 *   data-skew             → se inclina con la velocidad del scroll (los estandartes)
 *   data-pin-track        → pista horizontal fijada (desktop); en móvil es scroll nativo con snap
 * Con prefers-reduced-motion no se inicia nada: todo queda en su estado final.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function MotionRoot() {
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.classList.add("js");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || pathname.startsWith("/admin")) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    // Arranca después del load y en un momento ocioso: con streaming/PPR algunas secciones
    // se hidratan tarde, y SplitText no debe tocar el DOM antes de que React termine
    // (si no, hay desajuste de hidratación). También protege el LCP y el INP.
    const init = async () => {
      const [{ default: Lenis }, { gsap }, { ScrollTrigger }, { SplitText }] = await Promise.all([
        import("lenis"),
        import("gsap"),
        import("gsap/ScrollTrigger"),
        import("gsap/SplitText"),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger, SplitText);

      const touch = matchMedia("(pointer: coarse)").matches;
      const lenis = touch ? null : new Lenis({ duration: 1.15, smoothWheel: true });
      const raf = (t: number) => lenis?.raf(t * 1000);
      if (lenis) {
        lenis.on("scroll", ScrollTrigger.update);
        gsap.ticker.add(raf);
        gsap.ticker.lagSmoothing(0);
      }

      // Velocidad del scroll → una sola variable CSS que leen los estandartes
      const root = document.documentElement;
      const setVel = gsap.quickTo(root, "--velocity", { duration: 0.6, ease: "power3" });
      const onVel = (v: number) => setVel(Math.max(-1, Math.min(1, v / 40)));
      lenis?.on("scroll", (l: { velocity: number }) => onVel(l.velocity));
      let lastY = scrollY;
      const onNative = () => { onVel((scrollY - lastY) * 0.6); lastY = scrollY; };
      if (!lenis) addEventListener("scroll", onNative, { passive: true });

      const ctx = gsap.context(() => {
        const mm = gsap.matchMedia();

        document.querySelectorAll<HTMLElement>('[data-reveal="lines"]').forEach((el) => {
          const split = SplitText.create(el, { type: "lines", mask: "lines", linesClass: "line-inner" });
          gsap.from(split.lines, {
            yPercent: 110,
            duration: 1.05,
            ease: "expo.out",
            stagger: 0.07,
            scrollTrigger: { trigger: el, start: "top 88%", once: true },
            onComplete: () => split.revert(),
          });
        });

        ScrollTrigger.batch('[data-reveal="fade"]', {
          start: "top 90%",
          once: true,
          onEnter: (els) => gsap.to(els, { opacity: 1, translate: "0 0", duration: 0.9, ease: "expo.out", stagger: 0.06 }),
        });

        document.querySelectorAll<HTMLElement>("[data-parallax]").forEach((el) => {
          const amt = parseFloat(el.dataset.parallax || "0.15");
          gsap.fromTo(el, { yPercent: -amt * 50 }, {
            yPercent: amt * 50, ease: "none",
            scrollTrigger: { trigger: el.parentElement ?? el, start: "top bottom", end: "bottom top", scrub: true },
          });
        });

        mm.add("(min-width: 60em)", () => {
          document.querySelectorAll<HTMLElement>("[data-pin-track]").forEach((wrap) => {
            const track = wrap.querySelector<HTMLElement>("[data-track], [data-cms-kind='list']");
            if (!track) return;
            const dist = () => Math.max(0, track.scrollWidth - wrap.clientWidth);
            if (dist() < 40) return;
            gsap.to(track, {
              x: () => -dist(),
              ease: "none",
              scrollTrigger: {
                trigger: wrap, start: "top top", end: () => "+=" + dist(), pin: true, scrub: true,
                invalidateOnRefresh: true, anticipatePin: 1, fastScrollEnd: true,
              },
            });
          });
        });

        // Capítulos con progreso propio (ej. el incendio de 2017): exponen --progress 0→1
        document.querySelectorAll<HTMLElement>("[data-progress]").forEach((el) => {
          ScrollTrigger.create({
            trigger: el, start: "top top", end: "bottom bottom", scrub: true,
            onUpdate: (st) => el.style.setProperty("--progress", st.progress.toFixed(4)),
          });
        });
      });

      document.fonts?.ready.then(() => ScrollTrigger.refresh());

      cleanup = () => {
        ctx.revert();
        if (lenis) { gsap.ticker.remove(raf); lenis.destroy(); }
        removeEventListener("scroll", onNative);
      };
    };

    const idle = (cb: () => void) =>
      "requestIdleCallback" in window ? requestIdleCallback(cb, { timeout: 1200 }) : setTimeout(cb, 200);
    const start = () => idle(() => { if (!cancelled) void init(); });
    if (document.readyState === "complete") start();
    else addEventListener("load", start, { once: true });

    return () => { cancelled = true; removeEventListener("load", start); cleanup?.(); };
  }, [pathname]);

  return null;
}
