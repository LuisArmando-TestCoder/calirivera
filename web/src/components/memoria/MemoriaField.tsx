"use client";
/**
 * Comportamiento de «Memoria» sobre el DOM que renderiza el servidor (la verdad es el DOM):
 *  - filtros por tipo y colección (atributo hidden, sin re-renderizar la trama)
 *  - riel de años con el año actual marcado
 *  - teclado: flechas entre fotos por geometría, Enter abre el visor, Esc lo cierra
 *  - arrastrar con el mouse para recorrer los años (con inercia)
 *  - capa WebGPU (three/webgpu, cae a WebGL2) que se carga sola, en un momento ocioso
 *  - «Ver sin efectos»: apaga la capa y deja las fotos a color, quieto
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { MemoriaViewer, type ViewerItem } from "./MemoriaViewer";
import s from "./memoria.module.scss";

type Opt = { value: string; label: string };
type YearOpt = { key: string; label: string; count: number };

const FX_KEY = "memoria-fx";
const readFx = () => {
  try {
    return localStorage.getItem(FX_KEY) !== "off";
  } catch {
    return true;
  }
};

function itemFromLink(a: HTMLAnchorElement): ViewerItem {
  const d = a.dataset;
  return {
    slug: a.closest<HTMLElement>("[data-mem]")?.dataset.mem ?? "",
    href: a.getAttribute("href") ?? "#",
    title: d.title ?? "",
    caption: d.caption ?? "",
    year: d.year ?? "",
    kind: d.kindLabel ?? "",
    place: d.place ?? "",
    source: d.source ?? "",
    sourceUrl: d.sourceUrl ?? "",
    src: d.src ?? "",
    widths: (d.widths ?? "").split(",").filter(Boolean).map(Number),
    w: Number(d.w) || 1000,
    h: Number(d.h) || 1000,
    ai: a.closest("[data-ai]") !== null,
    alt: a.querySelector("img")?.alt ?? "",
  };
}

export function MemoriaField({
  children,
  total,
  kinds,
  collections,
  years,
}: {
  children: ReactNode;
  total: number;
  kinds: Opt[];
  collections: Opt[];
  years: YearOpt[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState("");
  const [col, setCol] = useState("");
  const [shown, setShown] = useState(total);
  const [active, setActive] = useState(years[0]?.key ?? "");
  const [fx, setFx] = useState(true);
  const [glState, setGlState] = useState<"off" | "loading" | "webgpu" | "webgl2" | "dom">("off");
  const [viewer, setViewer] = useState<{ item: ViewerItem; from: HTMLAnchorElement } | null>(null);

  // estado inicial desde la URL (?tipo=&c=) y preferencia guardada
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- leer la URL y localStorage solo existe en el cliente */
    setKind(p.get("tipo") ?? "");
    setCol(p.get("c") ?? "");
    setFx(readFx());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // ---------- filtros ----------
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let n = 0;
    el.querySelectorAll<HTMLElement>("[data-mem]").forEach((c) => {
      const ok = (!kind || c.dataset.kind === kind) && (!col || c.dataset.collection === col);
      c.hidden = !ok;
      if (ok) n++;
    });
    el.querySelectorAll<HTMLElement>("[data-year-block]").forEach((y) => {
      y.hidden = !y.querySelector("[data-mem]:not([hidden])");
    });
    setShown(n);
    const u = new URL(location.href);
    if (kind) u.searchParams.set("tipo", kind);
    else u.searchParams.delete("tipo");
    if (col) u.searchParams.set("c", col);
    else u.searchParams.delete("c");
    history.replaceState(history.state, "", u);
    window.dispatchEvent(new Event("memoria:layout"));
  }, [kind, col]);

  // ---------- año activo ----------
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActive((vis.target as HTMLElement).dataset.yearBlock ?? "");
      },
      { rootMargin: "-35% 0px -60% 0px" },
    );
    el.querySelectorAll("[data-year-block]").forEach((y) => io.observe(y));
    return () => io.disconnect();
  }, []);

  // ---------- visor ----------
  const visibleLinks = useCallback(
    () => [...(root.current?.querySelectorAll<HTMLAnchorElement>("[data-mem]:not([hidden]) [data-mem-link]") ?? [])],
    [],
  );
  const open = useCallback((a: HTMLAnchorElement) => setViewer({ item: itemFromLink(a), from: a }), []);
  const step = useCallback(
    (dir: 1 | -1) => {
      if (!viewer) return;
      const links = visibleLinks();
      const i = links.indexOf(viewer.from);
      const next = links[(i + dir + links.length) % links.length];
      if (next) {
        setViewer({ item: itemFromLink(next), from: next });
        next.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      }
    },
    [viewer, visibleLinks],
  );

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("[data-mem-link]");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      // con el editor del CMS abierto, el toque es para editar
      if (document.documentElement.classList.contains("cms-editing")) return;
      e.preventDefault();
      open(a);
    };
    // flechas: la foto más cercana en esa dirección
    const onKey = (e: KeyboardEvent) => {
      const a = (e.target as HTMLElement).closest?.<HTMLAnchorElement>("[data-mem-link]");
      if (!a || !["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      const r0 = a.getBoundingClientRect();
      const cx = r0.left + r0.width / 2;
      const cy = r0.top + r0.height / 2;
      let best: HTMLAnchorElement | null = null;
      let bestD = Infinity;
      for (const b of visibleLinks()) {
        if (b === a) continue;
        const r = b.getBoundingClientRect();
        const dx = r.left + r.width / 2 - cx;
        const dy = r.top + r.height / 2 - cy;
        const ok =
          e.key === "ArrowRight" ? dx > 8 : e.key === "ArrowLeft" ? dx < -8 : e.key === "ArrowDown" ? dy > 8 : dy < -8;
        if (!ok) continue;
        const along = e.key === "ArrowRight" || e.key === "ArrowLeft" ? Math.abs(dx) : Math.abs(dy);
        const across = e.key === "ArrowRight" || e.key === "ArrowLeft" ? Math.abs(dy) : Math.abs(dx);
        const d = along + across * 2.2;
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      if (best) {
        e.preventDefault();
        best.focus({ preventScroll: true });
        best.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" } as ScrollIntoViewOptions);
      }
    };
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("keydown", onKey);
    };
  }, [open, visibleLinks]);

  // ---------- arrastrar para recorrer (mouse) ----------
  useEffect(() => {
    const el = root.current;
    if (!el || matchMedia("(pointer: coarse)").matches) return;
    let down = false;
    let moved = 0;
    let lastY = 0;
    let v = 0;
    let raf = 0;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if ((e.target as HTMLElement).closest("a, button, input, select, [contenteditable]")) return;
      down = true;
      moved = 0;
      lastY = e.clientY;
      v = 0;
      cancelAnimationFrame(raf);
      el.setPointerCapture(e.pointerId);
      el.dataset.dragging = "";
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dy = e.clientY - lastY;
      lastY = e.clientY;
      moved += Math.abs(dy);
      v = v * 0.6 + dy * 0.4;
      window.scrollBy(0, -dy * 1.6);
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      delete el.dataset.dragging;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (moved < 4 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const glide = () => {
        v *= 0.92;
        window.scrollBy(0, -v * 1.6);
        if (Math.abs(v) > 0.3) raf = requestAnimationFrame(glide);
      };
      raf = requestAnimationFrame(glide);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // ---------- halo del puntero en modo DOM (sin GPU): variables CSS por foto ----------
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-mem]");
      if (!cell) return;
      const r = cell.getBoundingClientRect();
      cell.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      cell.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    return () => el.removeEventListener("pointermove", onMove);
  }, []);

  // ---------- capa WebGPU ----------
  useEffect(() => {
    const el = root.current;
    const gl = layer.current;
    const html = document.documentElement;
    if (!el || !gl) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const admin = document.cookie.includes("cr_admin=1");
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const weak = (nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2 || nav.connection?.saveData === true;
    const clear = () => {
      delete html.dataset.memFx;
    };
    /* eslint-disable react-hooks/set-state-in-effect -- el modo depende de capacidades que solo existen en el cliente */
    if (!fx) {
      html.dataset.memFx = "off";
      setGlState("off");
      return clear;
    }
    if (reduced || admin || weak) {
      html.dataset.memFx = "dom";
      setGlState("dom");
      return clear;
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    html.dataset.memFx = "dom";
    let stop: (() => void) | undefined;
    let cancelled = false;
    const launch = (forceWebGL: boolean) =>
      import("./gl")
        .then(({ startMemoriaGL }) => startMemoriaGL(el, gl, { forceWebGL }))
        .then((h) => {
          if (cancelled) return h.stop();
          stop = h.stop;
          html.dataset.memFx = "gl";
          setGlState(h.backend);
          h.onFail((why) => {
            stop = undefined;
            // WebGPU con un driver/navegador que falla al dibujar: un intento más con WebGL2
            if (h.backend === "webgpu" && why.startsWith("error") && !cancelled) {
              console.warn("[memoria] WebGPU falló, pruebo WebGL2:", why);
              html.dataset.memFx = "dom";
              void launch(true);
              return;
            }
            console.warn("[memoria] capa GPU apagada:", why);
            html.dataset.memFx = "dom";
            setGlState("dom");
          });
        })
        .catch((err) => {
          console.warn("[memoria] sin GPU, sigue en modo DOM:", err);
          html.dataset.memFx = "dom";
          setGlState("dom");
        });
    const start = () => {
      if (cancelled) return;
      setGlState("loading");
      void launch(false);
    };
    const idle = "requestIdleCallback" in window ? requestIdleCallback(start, { timeout: 1500 }) : globalThis.setTimeout(start, 400);
    return () => {
      cancelled = true;
      if ("cancelIdleCallback" in window) cancelIdleCallback(idle as number);
      else clearTimeout(idle as number);
      stop?.();
      delete html.dataset.memFx;
    };
  }, [fx]);

  const toggleFx = () => {
    const next = !fx;
    try {
      localStorage.setItem(FX_KEY, next ? "on" : "off");
    } catch {}
    setFx(next);
  };

  const jump = (key: string) => {
    const t = document.getElementById(`y${key}`);
    if (!t) return;
    t.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" } as ScrollIntoViewOptions);
    t.querySelector<HTMLAnchorElement>("[data-mem]:not([hidden]) [data-mem-link]")?.focus({ preventScroll: true });
  };

  return (
    <div className={s.field}>
      <div className={s.toolbar}>
        <div className={s.filters} role="group" aria-label="Filtrar recuerdos">
          <label className={s.select}>
            <span>Qué</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Todo</option>
              {kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          {collections.length > 0 && (
            <label className={s.select}>
              <span>Colección</span>
              <select value={col} onChange={(e) => setCol(e.target.value)}>
                <option value="">Todas</option>
                {collections.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className={s.fxToggle} aria-pressed={!fx} onClick={toggleFx}>
            {fx ? "Ver sin efectos" : "Ver con efectos"}
          </button>
        </div>
        <p className={s.count} role="status" aria-live="polite">
          {shown === total ? `${total} recuerdos` : `${shown} de ${total} recuerdos`}
        </p>
      </div>

      <nav className={s.rail} aria-label="Años">
        <ol>
          {years.map((y) => (
            <li key={y.key}>
              <a
                href={`#y${y.key}`}
                aria-current={active === y.key ? "true" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  jump(y.key);
                }}
                style={{ "--n": Math.min(12, y.count) } as React.CSSProperties}
              >
                <span>{y.label}</span>
                <i aria-hidden />
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div ref={layer} className={s.glLayer} aria-hidden />
      <div ref={root} className={s.stage} data-gl={glState}>
        {children}
      </div>

      <MemoriaViewer
        item={viewer?.item ?? null}
        onClose={() => {
          const from = viewer?.from;
          setViewer(null);
          from?.focus({ preventScroll: true });
        }}
        onStep={step}
      />
    </div>
  );
}
