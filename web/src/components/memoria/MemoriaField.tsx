"use client";
/**
 * «Memoria» como una línea horizontal (sobre el DOM que renderiza el servidor; la verdad es el DOM):
 *  - el campo se fija a pantalla completa y el scroll vertical (rueda, trackpad, teclado, dedo) corre la cinta
 *    de años de izquierda a derecha; también se puede arrastrar de lado o usar el scroll horizontal del trackpad
 *  - cada año es un capítulo: su número enorme en contorno pasa detrás de las fotos a otra velocidad (paralaje),
 *    el año actual rueda como un cuentakilómetros abajo a la izquierda y la regla de años marca dónde estás
 *  - las fotos se acomodan solas en una trama de celdas cuadradas (alto = jerarquía, ancho = aspecto real)
 *  - filtros por tipo y colección (atributo hidden), teclado entre fotos por geometría, visor con historial
 *  - capa GPU (three/webgpu, cae a WebGL2): con efectos, ceniza → color, calor y tela; «sin efectos» es la
 *    misma capa y el mismo canvas sin efectos (cientos de <img> en el DOM pesaban más que el canvas)
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { sfx } from "@/components/sound/SoundRoot";
import { hoverLabel } from "./hover-label";
import { MemoriaViewer, type ViewerItem } from "./MemoriaViewer";
import s from "./memoria.module.scss";

type Opt = { value: string; label: string };
type YearOpt = { key: string; label: string; count: number };

const FX_KEY = "memoria-fx";
const DENSITY_KEY = "memoria-densidad";
const readFx = () => {
  try {
    return localStorage.getItem(FX_KEY) !== "off";
  } catch {
    return true;
  }
};
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
type LenisLike = { scrollTo: (t: number, o?: { immediate?: boolean; duration?: number; force?: boolean }) => void };
const lenis = () => (window as unknown as { __lenis?: LenisLike }).__lenis;
const scrollToY = (y: number, instant: boolean) => {
  const l = lenis();
  if (l) l.scrollTo(y, { immediate: instant || reducedMotion(), duration: 1.1, force: true });
  else window.scrollTo({ top: y, behavior: instant || reducedMotion() ? ("instant" as ScrollBehavior) : "smooth" });
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

/** Geometría de la cinta: dónde empieza a fijarse el campo y cuánto puede correrse. */
type Geo = {
  pinStart: number;
  maxX: number;
  vh: number;
  vw: number;
  blocks: { key: string; year: number | null; left: number; width: number; el: HTMLElement; ghost: HTMLElement | null; gw: number }[];
};

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
  const root = useRef<HTMLDivElement>(null); // la cinta (se traslada)
  const layer = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null); // alto = recorrido
  const pinRef = useRef<HTMLDivElement>(null); // pantalla fija
  const toolRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const odoRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLSpanElement>(null); // cabezal de la regla
  const [far, setFar] = useState(false);
  const [kind, setKind] = useState("");
  const [col, setCol] = useState("");
  const [shown, setShown] = useState(total);
  const [active, setActive] = useState(years[0]?.key ?? "");
  const [fx, setFx] = useState(true);
  const [ticks, setTicks] = useState<{ key: string; label: string; at: number }[]>([]);
  const [glState, setGlState] = useState<"off" | "loading" | "webgpu" | "webgl2" | "dom">("off");
  const [viewer, setViewer] = useState<{ item: ViewerItem; from: HTMLAnchorElement } | null>(null);
  // Mientras el visor está abierto, la trama le cede la GPU (el visor tiene su propio motor y la tapa entera).
  const glRef = useRef<import("./gl").GLHandle | null>(null);
  const viewerOpen = useRef(false);
  useEffect(() => {
    viewerOpen.current = viewer !== null;
    glRef.current?.hold(viewer !== null);
  }, [viewer]);

  // estado inicial desde la URL (?tipo=&c=) y preferencias guardadas
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- leer la URL y localStorage solo existe en el cliente */
    setKind(p.get("tipo") ?? "");
    setCol(p.get("c") ?? "");
    setFx(readFx());
    try {
      setFar(localStorage.getItem(DENSITY_KEY) === "lejos");
    } catch {}
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

  // densidad: vista general (más fotos, más chicas) o detalle
  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_KEY, far ? "lejos" : "cerca");
    } catch {}
    window.dispatchEvent(new Event("memoria:layout"));
  }, [far]);

  // ---------- la cinta: scroll vertical → recorrido horizontal ----------
  const geo = useRef<Geo>({ pinStart: 0, maxX: 0, vh: 1, vw: 1, blocks: [] });
  const applied = useRef(Number.NaN);
  /** Lleva la cinta al scroll actual y devuelve el origen del contenido en pantalla (lo usa también la GPU). */
  const sync = useCallback(() => {
    const g = geo.current;
    const sy = window.scrollY;
    const x = Math.min(g.maxX, Math.max(0, sy - g.pinStart));
    if (x !== applied.current && root.current) {
      root.current.style.transform = `translate3d(${(-x).toFixed(2)}px, 0, 0)`;
      applied.current = x;
    }
    const pinEnd = g.pinStart + g.maxX;
    const oy = sy < g.pinStart ? g.pinStart - sy : sy > pinEnd ? pinEnd - sy : 0;
    return { x: -x, y: oy, sx: x };
  }, []);
  const origin = useCallback(() => {
    const o = sync();
    return { x: o.x, y: o.y };
  }, [sync]);

  /** Desplazamiento de la cinta necesario para centrar un elemento. */
  const reveal = useCallback(
    (el: Element, instant: boolean) => {
      const g = geo.current;
      const stage = root.current;
      if (!stage) return;
      const r = el.getBoundingClientRect();
      const sr = stage.getBoundingClientRect(); // ya trasladada: sr.left = borde - x
      const local = r.left - sr.left; // posición dentro de la cinta
      const x = Math.min(g.maxX, Math.max(0, local + r.width / 2 - g.vw / 2));
      scrollToY(g.pinStart + x, instant);
    },
    [],
  );

  useEffect(() => {
    const field = fieldRef.current;
    const pin = pinRef.current;
    const stage = root.current;
    const tool = toolRef.current;
    const html = document.documentElement;
    if (!field || !pin || !stage || !tool) return;
    let raf = 0;
    let locked = false;
    let lastKey = "";

    const relayout = () => {
      const vh = pin.clientHeight || innerHeight;
      const vw = pin.clientWidth || innerWidth;
      const maxX = Math.max(0, stage.scrollWidth - vw);
      field.style.setProperty("--run", `${maxX}px`);
      pin.style.setProperty("--tool-h", `${tool.offsetHeight}px`);
      const blocks = [...stage.querySelectorAll<HTMLElement>("[data-year-block]")]
        .filter((b) => !b.hidden)
        .map((b) => ({
          key: b.dataset.yearBlock ?? "",
          year: /^\d{4}$/.test(b.dataset.yearBlock ?? "") ? Number(b.dataset.yearBlock) : null,
          left: b.offsetLeft,
          width: b.offsetWidth,
          el: b,
          ghost: b.querySelector<HTMLElement>("[data-ghost]"),
          gw: b.querySelector<HTMLElement>("[data-ghost]")?.offsetWidth ?? 0,
        }));
      geo.current = { pinStart: field.getBoundingClientRect().top + window.scrollY, maxX, vh, vw, blocks };
      const span = Math.max(1, stage.scrollWidth);
      setTicks(blocks.map((b) => ({ key: b.key, label: years.find((y) => y.key === b.key)?.label ?? b.key, at: (b.left / span) * 100 })));
      applied.current = Number.NaN;
      frame();
      window.dispatchEvent(new Event("memoria:layout")); // la GPU vuelve a medir
    };

    const frame = () => {
      raf = 0;
      const g = geo.current;
      const { sx } = sync();
      const pinned = window.scrollY >= g.pinStart - 1 && window.scrollY <= g.pinStart + g.maxX + g.vh * 0.5;
      if (pinned !== locked) {
        locked = pinned;
        if (pinned) html.dataset.chromeLock = "hidden";
        else delete html.dataset.chromeLock;
        window.dispatchEvent(new Event("chrome:lock"));
      }
      // año bajo la lectura (un poco a la izquierda del centro) y cuánto falta para el siguiente
      const look = sx + g.vw * 0.38;
      const bs = g.blocks;
      let i = 0;
      while (i < bs.length - 1 && bs[i + 1].left <= look) i++;
      const b = bs[i];
      if (b && b.key !== lastKey) {
        if (lastKey) sfx("tick"); // el cuentakilómetros pasa de año
        lastKey = b.key;
        setActive(b.key);
      }
      // cuentakilómetros: cada cifra rueda entre el año actual y el próximo con fecha
      const odo = odoRef.current;
      if (odo && b) {
        const nb = bs[i + 1];
        const f = nb ? Math.min(1, Math.max(0, (look - (nb.left - g.vw * 0.25)) / (g.vw * 0.25))) : 0;
        const ya = b.year;
        const yb = nb?.year ?? ya;
        if (ya === null) delete odo.dataset.dated;
        else odo.dataset.dated = "";
        if (ya !== null) {
          const da = String(ya).padStart(4, "0");
          const db = String(yb ?? ya).padStart(4, "0");
          odo.querySelectorAll<HTMLElement>("[data-digit]").forEach((col, k) => {
            const v = Number(da[k]) + (Number(db[k]) - Number(da[k])) * f;
            col.style.transform = `translate3d(0, ${(-v * 10).toFixed(3)}%, 0)`;
          });
        }
      }
      // números enormes detrás: cuando su capítulo empieza a irse, el número se queda atrás (corre a ~60 %
      // de la velocidad de las fotos) hasta el final de su capítulo; nunca invade el del al lado
      for (const blk of bs) {
        if (!blk.ghost) continue;
        const screen = blk.left - sx; // borde izquierdo del bloque en pantalla
        if (screen > g.vw * 1.6 || screen + blk.width < -g.vw * 0.8) continue;
        const shift = Math.min(Math.max(0, blk.width - blk.gw), Math.max(0, -screen * 0.42));
        blk.ghost.style.transform = `translate3d(${shift.toFixed(1)}px, 0, 0)`;
      }
      // regla de años
      if (headRef.current) headRef.current.style.left = `${g.maxX ? (sx / g.maxX) * 100 : 0}%`;
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    let relayoutRaf = 0;
    const queueRelayout = () => {
      cancelAnimationFrame(relayoutRaf);
      relayoutRaf = requestAnimationFrame(relayout);
    };
    const ro = new ResizeObserver(queueRelayout);
    ro.observe(stage);
    ro.observe(pin);
    ro.observe(tool);
    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", queueRelayout);
    addEventListener("memoria:relayout", queueRelayout);
    void document.fonts?.ready.then(queueRelayout);
    relayout();
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(relayoutRaf);
      ro.disconnect();
      removeEventListener("scroll", queue);
      removeEventListener("resize", queueRelayout);
      removeEventListener("memoria:relayout", queueRelayout);
      delete html.dataset.chromeLock;
      window.dispatchEvent(new Event("chrome:lock"));
    };
  }, [sync, years]);

  // filtros y densidad cambian el ancho de la cinta
  useEffect(() => {
    window.dispatchEvent(new Event("memoria:relayout"));
  }, [kind, col, far]);

  // scroll horizontal del trackpad (y Mayús+rueda) → recorrido
  useEffect(() => {
    const pin = pinRef.current;
    if (!pin) return;
    const onWheel = (e: WheelEvent) => {
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      if (Math.abs(dx) <= Math.abs(e.deltaY) && !e.shiftKey) return; // vertical: lo maneja el scroll normal
      e.preventDefault();
      const l = lenis();
      const y = window.scrollY + dx;
      if (l) l.scrollTo(y, { immediate: true });
      else window.scrollTo(0, y);
    };
    pin.addEventListener("wheel", onWheel, { passive: false });
    return () => pin.removeEventListener("wheel", onWheel);
  }, []);

  // título en itálica sobre la foto (hover / foco); la cinta se mueve, así que lo sigue
  useEffect(() => {
    if (!root.current || !labelRef.current || matchMedia("(pointer: coarse)").matches) return;
    return hoverLabel(root.current, labelRef.current, { moving: true });
  }, []);

  // ---------- visor ----------
  const visibleLinks = useCallback(
    () => [...(root.current?.querySelectorAll<HTMLAnchorElement>("[data-mem]:not([hidden]) [data-mem-link]") ?? [])],
    [],
  );
  // El visor tiene su propia entrada en el historial (?ver=slug): «Atrás» lo cierra en vez de salir de Memoria,
  // y el enlace se puede compartir. pushed = la entrada la agregamos nosotros (cerrar = volver atrás).
  const pushed = useRef(false);
  const setVerParam = (slug: string | null, mode: "push" | "replace") => {
    const u = new URL(location.href);
    if (slug) u.searchParams.set("ver", slug);
    else u.searchParams.delete("ver");
    const state = { ...history.state, __memoriaVer: slug ?? undefined };
    if (mode === "push") history.pushState(state, "", u);
    else history.replaceState(state, "", u);
  };
  const show = useCallback((a: HTMLAnchorElement, mode: "push" | "replace") => {
    const item = itemFromLink(a);
    setViewer({ item, from: a });
    if (mode === "push" && !pushed.current) {
      pushed.current = true;
      setVerParam(item.slug, "push");
    } else setVerParam(item.slug, "replace");
  }, []);
  const open = useCallback((a: HTMLAnchorElement) => show(a, "push"), [show]);
  const closeViewer = useCallback(() => {
    if (pushed.current && history.state?.__memoriaVer) {
      pushed.current = false;
      history.back(); // popstate cierra
      return;
    }
    pushed.current = false;
    if (new URLSearchParams(location.search).has("ver")) setVerParam(null, "replace");
    setViewer(null);
  }, []);

  useEffect(() => {
    const onPop = () => {
      const slug = (history.state as { __memoriaVer?: string } | null)?.__memoriaVer;
      if (!slug) {
        pushed.current = false;
        setViewer(null);
      }
    };
    addEventListener("popstate", onPop);
    // enlace compartido: /memoria?ver=slug abre esa foto
    const ver = new URLSearchParams(location.search).get("ver");
    const a = ver ? root.current?.querySelector<HTMLAnchorElement>(`[data-mem="${CSS.escape(ver)}"] [data-mem-link]`) : null;
    if (a) {
      // la cinta tiene que estar medida antes de poder llevar la foto a la vista
      requestAnimationFrame(() => reveal(a, true));
      show(a, "replace");
    }
    return () => removeEventListener("popstate", onPop);
  }, [show, reveal]);
  const yearOf = useCallback((a: HTMLAnchorElement) => {
    const block = a.closest<HTMLElement>("[data-year-block]");
    const links = [...(block?.querySelectorAll<HTMLAnchorElement>("[data-mem]:not([hidden]) [data-mem-link]") ?? [])];
    return { links, index: links.indexOf(a), label: block?.querySelector("h2 span")?.textContent ?? "" };
  }, []);
  const step = useCallback(
    (dir: 1 | -1) => {
      if (!viewer) return;
      const links = visibleLinks();
      const i = links.indexOf(viewer.from);
      const next = links[(i + dir + links.length) % links.length];
      if (next) {
        show(next, "replace");
        reveal(next, true);
      }
    },
    [viewer, visibleLinks, show, reveal],
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
        reveal(best, false);
      }
    };
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("keydown", onKey);
    };
  }, [open, visibleLinks, reveal]);

  // ---------- arrastrar de lado (mouse y dedo) ----------
  useEffect(() => {
    const el = pinRef.current;
    if (!el) return;
    let down = false;
    let moved = 0;
    let lastX = 0;
    let lastY = 0;
    let v = 0;
    let raf = 0;
    let id = -1;
    let axis: "x" | "y" | null = null;
    const by = (d: number) => {
      const l = lenis();
      const y = window.scrollY + d;
      if (l) l.scrollTo(y, { immediate: true });
      else window.scrollTo(0, y);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (e.pointerType === "mouse" && (e.target as HTMLElement).closest("a, button, input, select, [contenteditable], [data-ruler]")) return;
      if ((e.target as HTMLElement).closest("button, input, select, [contenteditable], [data-ruler]")) return;
      down = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      v = 0;
      axis = e.pointerType === "mouse" ? "x" : null;
      id = e.pointerId;
      cancelAnimationFrame(raf);
    };
    const onMove = (e: PointerEvent) => {
      if (!down || e.pointerId !== id) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (!axis) {
        if (Math.abs(dx) + Math.abs(dy) < 6) return;
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y"; // dedo: vertical lo hace el navegador
        if (axis === "y") return void (down = false);
      }
      lastX = e.clientX;
      lastY = e.clientY;
      moved += Math.abs(dx);
      if (moved > 4 && !el.hasPointerCapture(e.pointerId)) {
        el.setPointerCapture(e.pointerId);
        el.dataset.dragging = "";
      }
      v = v * 0.6 + dx * 0.4;
      by(-dx * 1.5);
    };
    const onUp = (e: PointerEvent) => {
      if (!down || e.pointerId !== id) return;
      down = false;
      delete el.dataset.dragging;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (moved < 4 || reducedMotion()) return;
      const glide = () => {
        v *= 0.93;
        by(-v * 1.5);
        if (Math.abs(v) > 0.3) raf = requestAnimationFrame(glide);
      };
      raf = requestAnimationFrame(glide);
    };
    // un arrastre no es un clic
    const onClickCapture = (e: MouseEvent) => {
      if (moved > 6) {
        e.preventDefault();
        e.stopPropagation();
        moved = 0;
      }
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClickCapture, true);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  // ---------- capa GPU: una sola, con o sin efectos ----------
  const fxRef = useRef(fx);
  useEffect(() => {
    fxRef.current = fx;
    glRef.current?.setPlain(!fx);
    const html = document.documentElement;
    if (glRef.current) html.dataset.memFx = fx ? "gl" : "plain";
    try {
      localStorage.setItem(FX_KEY, fx ? "on" : "off");
    } catch {}
  }, [fx]);

  useEffect(() => {
    const el = root.current;
    const gl = layer.current;
    const html = document.documentElement;
    if (!el || !gl) return;
    const admin = document.cookie.includes("cr_admin=1");
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const weak = (nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2 || nav.connection?.saveData === true;
    const clear = () => {
      delete html.dataset.memFx;
    };
    /* eslint-disable react-hooks/set-state-in-effect -- el modo depende de capacidades que solo existen en el cliente */
    if (admin || weak) {
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
        .then(({ startMemoriaGL }) =>
          startMemoriaGL(el, gl, {
            forceWebGL,
            slot: far ? 256 : 512,
            origin,
            axis: "x",
            detachImages: true,
            // movimiento reducido: la GPU igual dibuja (rinde más que el DOM), pero quieta
            plain: !fxRef.current || reducedMotion(),
          }),
        )
        .then((h) => {
          if (cancelled) return h.stop();
          stop = h.stop;
          glRef.current = h;
          h.hold(viewerOpen.current);
          html.dataset.memFx = fxRef.current && !reducedMotion() ? "gl" : "plain";
          setGlState(h.backend);
          h.onFail((why) => {
            stop = undefined;
            glRef.current = null;
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
      glRef.current = null;
      delete html.dataset.memFx;
    };
  }, [far, origin]);

  const jump = (key: string) => {
    const t = document.getElementById(`y${key}`);
    if (!t) return;
    const g = geo.current;
    const b = g.blocks.find((x) => x.key === key);
    scrollToY(g.pinStart + Math.min(g.maxX, Math.max(0, (b?.left ?? 0) - g.vw * 0.06)), false);
    t.querySelector<HTMLAnchorElement>("[data-mem]:not([hidden]) [data-mem-link]")?.focus({ preventScroll: true });
  };

  const yearCtx = viewer ? yearOf(viewer.from) : null;
  const activeLabel = years.find((y) => y.key === active)?.label ?? "";

  return (
    <div ref={fieldRef} className={s.field} data-density={far ? "lejos" : "cerca"}>
      <div ref={pinRef} className={s.pin}>
        <div ref={toolRef} className={s.toolbar}>
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
            <button type="button" className={s.fxToggle} aria-pressed={!fx} onClick={() => setFx((v) => !v)}>
              {fx ? "Ver sin efectos" : "Ver con efectos"}
            </button>
          </div>
          <p className={s.count} role="status" aria-live="polite">
            {shown === total ? `${total} recuerdos` : `${shown} de ${total} recuerdos`}
          </p>
        </div>

        <div className={s.viewport}>
          <div ref={root} className={s.stage} data-gl={glState}>
            {children}
          </div>
        </div>

        <div className={s.bottom}>
          {/* el año actual, rodando entre uno y otro como un cuentakilómetros */}
          <div ref={odoRef} className={s.odo} aria-hidden data-dated="">
            {[0, 1, 2, 3].map((k) => (
              <span key={k} className={s.odoCol}>
                <span data-digit className={s.odoReel}>
                  {"0123456789".split("").map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </span>
              </span>
            ))}
            <span className={s.odoUndated}>s/f</span>
          </div>
          <p className="visually-hidden" aria-live="polite">
            {activeLabel}
          </p>
          <nav className={s.ruler} aria-label="Años" data-ruler>
            <span className={s.rulerLine} aria-hidden />
            <span ref={headRef} className={s.rulerHead} aria-hidden />
            <ol>
              {ticks.map((t) => (
                <li key={t.key} style={{ left: `${t.at}%` }}>
                  <a
                    href={`#y${t.key}`}
                    aria-current={active === t.key ? "true" : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      jump(t.key);
                    }}
                  >
                    <span>{t.label}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className={s.zoom} role="group" aria-label="Tamaño de las fotos">
            <button type="button" onClick={() => setFar(false)} aria-pressed={!far} aria-label="Acercar: fotos grandes">
              <span aria-hidden>+</span>
            </button>
            <button type="button" onClick={() => setFar(true)} aria-pressed={far} aria-label="Alejar: vista general">
              <span aria-hidden>−</span>
            </button>
          </div>
        </div>
      </div>

      <div ref={layer} className={s.glLayer} aria-hidden />
      <div ref={labelRef} className={s.hoverLabel} aria-hidden />

      <MemoriaViewer
        item={viewer?.item ?? null}
        year={yearCtx ? { label: yearCtx.label, index: yearCtx.index, items: yearCtx.links.map(itemFromLink) } : null}
        onPick={(i) => {
          const next = yearCtx?.links[i];
          if (next) {
            show(next, "replace");
            reveal(next, true);
          }
        }}
        onClose={() => {
          const from = viewer?.from;
          closeViewer();
          from?.focus({ preventScroll: true });
        }}
        onStep={step}
      />
    </div>
  );
}
