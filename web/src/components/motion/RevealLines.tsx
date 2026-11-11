"use client";
/**
 * Las líneas del texto suben desde una máscara al entrar en pantalla (GSAP SplitText).
 *
 * Es un componente cliente a propósito: su useEffect corre solo cuando ESTE árbol ya se
 * hidrató, así SplitText nunca toca nodos que React todavía va a hidratar (con <Suspense>
 * y streaming eso causaba "Hydration failed"). Al terminar, el texto vuelve a su DOM original
 * (split.revert), así el CMS y React siguen viendo exactamente lo que renderizaron.
 */
import { useEffect, useRef, type ReactNode } from "react";

export function RevealLines({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // En modo edición del CMS no se parte el texto (contenteditable necesita el DOM intacto)
    if (document.documentElement.classList.contains("cms-editing")) return;

    let cancelled = false;
    let undo: (() => void) | undefined;

    (async () => {
      const [{ gsap }, { ScrollTrigger }, { SplitText }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
        import("gsap/SplitText"),
      ]);
      if (cancelled || !el.isConnected) return;
      gsap.registerPlugin(ScrollTrigger, SplitText);
      await document.fonts?.ready; // medir líneas con la tipografía final
      if (cancelled || !el.isConnected) return;

      const split = SplitText.create(el, { type: "lines", mask: "lines", linesClass: "line-inner" });
      const tween = gsap.from(split.lines, {
        yPercent: 110,
        duration: 1.05,
        ease: "expo.out",
        stagger: 0.07,
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
        onComplete: () => split.revert(),
      });
      undo = () => {
        tween.scrollTrigger?.kill();
        tween.kill();
        split.revert();
      };
    })();

    return () => {
      cancelled = true;
      undo?.();
    };
  }, []);

  return (
    <div ref={ref} className={className} data-reveal="lines">
      {children}
    </div>
  );
}
