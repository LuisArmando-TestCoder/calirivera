"use client";
/**
 * Lo que pasa al cambiar de página:
 *  - Scroll arriba siempre, salvo un #ancla. Con Atrás/Adelante vuelve a donde estabas en esa página
 *    (se guarda la posición por ruta; la página llega por partes, así que se reintenta hasta que mide lo suficiente).
 *    Lenis (scroll suave) tenía inercia de la página anterior y devolvía el scroll a mitad de camino.
 *  - Transición entre páginas (ViewTransition) solo con puntero fino: en el teléfono la barra del navegador
 *    se esconde o aparece durante la transición, la ventana cambia de alto y el navegador la aborta
 *    («Transition was aborted because of invalid state. Viewport size changed»).
 */
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, ViewTransition, type ReactNode } from "react";

type LenisLike = { scrollTo: (t: number, o?: { immediate?: boolean; force?: boolean }) => void; stop: () => void; start: () => void };
const lenis = () => (window as unknown as { __lenis?: LenisLike }).__lenis;

const isAbortedTransition = (e: unknown) =>
  e instanceof DOMException && (e.name === "InvalidStateError" || e.name === "AbortError") && /Transition was (aborted|skipped)/i.test(e.message);

const KEY = "scroll-pos";
const positions = (): Record<string, number> => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
};
const here = () => location.pathname + location.search;

function scrollToNow(y: number) {
  const l = lenis();
  if (l) {
    l.stop();
    l.scrollTo(y, { immediate: true, force: true });
    l.start();
  }
  window.scrollTo({ top: y, left: 0, behavior: "instant" as ScrollBehavior });
}

export function ScrollReset() {
  const pathname = usePathname();
  const pop = useRef(false);
  const first = useRef(true);

  // recordar dónde está cada página (la ruta ya cambió cuando la nueva hace scroll, así que no se pisan)
  useEffect(() => {
    let raf = 0;
    const save = () => {
      raf = 0;
      const p = positions();
      p[here()] = Math.round(scrollY);
      try {
        sessionStorage.setItem(KEY, JSON.stringify(p));
      } catch {}
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(save);
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    const onPop = () => (pop.current = true);
    // Una transición abortada (la ventana cambió de alto a mitad de camino) no es un error: el navegador salta la
    // animación y la página nueva ya está. Se calla solo ese caso; cualquier otro error sigue su curso.
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isAbortedTransition(e.reason)) e.preventDefault();
    };
    const onError = (e: ErrorEvent) => {
      if (isAbortedTransition(e.error)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    addEventListener("popstate", onPop);
    addEventListener("unhandledrejection", onRejection);
    addEventListener("error", onError, true);
    return () => {
      removeEventListener("popstate", onPop);
      removeEventListener("unhandledrejection", onRejection);
      removeEventListener("error", onError, true);
    };
  }, []);

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const wasPop = pop.current;
    pop.current = false;
    if (location.hash) return;
    let raf = 0;
    if (wasPop) {
      // volver a donde estaba: reintentar mientras la página termina de llegar (hasta ~1,5 s)
      const target = positions()[here()] ?? 0;
      const t0 = performance.now();
      const restore = () => {
        const max = document.documentElement.scrollHeight - innerHeight;
        scrollToNow(Math.min(target, max));
        if (max < target && performance.now() - t0 < 1500) raf = requestAnimationFrame(restore);
      };
      restore();
      return () => cancelAnimationFrame(raf);
    }
    scrollToNow(0);
    // la página nueva puede terminar de llegar (Suspense) un cuadro después
    raf = requestAnimationFrame(() => scrollToNow(0));
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return null;
}

const fine = (cb: () => void) => {
  const m = matchMedia("(pointer: fine)");
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/**
 * Chrome aborta la transición cuando la pestaña está oculta o la ventana cambia de alto, con un
 * InvalidStateError cuyo mensaje ahora trae el motivo al final («…invalid state. Document hidden»,
 * «…Viewport size changed»). React solo ignora el mensaje exacto sin motivo, así que lo reportaba como error.
 * Acá se normaliza: las promesas de cada transición rechazan con el mensaje que React ya sabe ignorar.
 * El cambio de página ocurre igual; solo se pierde la animación (que nadie iba a ver).
 */
const ABORTED = "Transition was aborted because of invalid state";
let guarded = false;
function guardAbortedTransitions() {
  if (guarded || typeof document.startViewTransition !== "function") return;
  guarded = true;
  const orig = document.startViewTransition.bind(document);
  const tidy = (p: Promise<unknown>) =>
    p.catch((e: unknown) => {
      if (e instanceof DOMException && e.name === "InvalidStateError" && e.message.startsWith(ABORTED)) throw new DOMException(ABORTED, "InvalidStateError");
      throw e;
    });
  document.startViewTransition = ((arg?: unknown) => {
    const vt = orig(arg as never) as unknown as Record<string, unknown>;
    const fixed = new Map<string, Promise<unknown>>();
    return new Proxy(vt, {
      get(target, prop) {
        const v = Reflect.get(target, prop, target);
        if (typeof prop === "string" && (prop === "ready" || prop === "finished" || prop === "updateCallbackDone") && v instanceof Promise) {
          if (!fixed.has(prop)) fixed.set(prop, tidy(v));
          return fixed.get(prop);
        }
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      },
    });
  }) as unknown as typeof document.startViewTransition;
}

export function PageTransition({ children }: { children: ReactNode }) {
  useEffect(guardAbortedTransitions, []);
  // en el servidor y en la primera hidratación: sin transición (igual que en un teléfono); después, según el puntero
  const canAnimate = useSyncExternalStore(fine, () => matchMedia("(pointer: fine)").matches, () => false);
  return <ViewTransition default={canAnimate ? "page" : "none"}>{children}</ViewTransition>;
}
