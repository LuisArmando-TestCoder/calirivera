"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SEL = "main h1, main h2, main h3, footer h2, [data-fit]";

/** Achica un título lo justo para que su palabra más larga entre en su caja (nunca lo agranda). */
export function fitHeading(el: HTMLElement) {
  el.style.removeProperty("font-size");
  if (!el.isConnected || el.clientWidth < 40 || getComputedStyle(el).writingMode !== "horizontal-tb") return;
  // se mide sin permitir partir palabras: primero achicar, partir es el último recurso (CSS)
  el.style.overflowWrap = "normal";
  el.style.hyphens = "manual";
  for (let i = 0; i < 3; i++) {
    const over = el.scrollWidth - el.clientWidth;
    if (over <= 1) break;
    const size = parseFloat(getComputedStyle(el).fontSize);
    // un pelo de más por el redondeo de subpíxeles; piso de 45 % (después ya parte la palabra el CSS)
    const next = Math.max(size * 0.45, size * (el.clientWidth / el.scrollWidth) * 0.985);
    el.style.fontSize = `${next.toFixed(2)}px`;
    if (next <= size * 0.451) break;
  }
  el.style.removeProperty("overflow-wrap");
  el.style.removeProperty("hyphens");
}

/**
 * Todos los títulos entran en cualquier ancho de ventana. Los tamaños están pensados en proporción a la
 * pantalla, pero una palabra larga («Trayectoria», «Colaboración») puede no caber en una ventana angosta:
 * acá se mide cada título y, si se sale, se achica hasta que entra. Se repite al cambiar el tamaño, la página,
 * las tipografías o el contenido (editor).
 */
export function HeadingFit() {
  const pathname = usePathname();
  useEffect(() => {
    let raf = 0;
    const run = () => {
      raf = 0;
      document.querySelectorAll<HTMLElement>(SEL).forEach((el) => {
        if (el.closest("dialog, [data-cms-bar]")) return;
        fitHeading(el);
      });
      window.dispatchEvent(new Event("headings:fit"));
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(run);
    };
    queue();
    const t = setTimeout(queue, 600); // contenido que llega después (Suspense)
    addEventListener("resize", queue);
    void document.fonts?.ready.then(queue);
    const mo = new MutationObserver((list) => {
      if (list.some((m) => m.type === "childList" || m.type === "characterData")) queue();
    });
    const main = document.querySelector("main");
    if (main) mo.observe(main, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      removeEventListener("resize", queue);
      mo.disconnect();
    };
  }, [pathname]);
  return null;
}
