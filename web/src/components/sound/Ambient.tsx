"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { embedded } from "@/lib/embed";
import { SOUND_EVENT, soundOn } from "./engine";
import s from "./ambient.module.scss";

/**
 * Música de fondo: «Detrás de la ventana» (Cali Rivera, 2005), la pieza que acompañaba esa colección.
 * Un disco en la esquina: se toca y suena; se vuelve a tocar y calla. Nunca arranca sola.
 *  - El anillo marca por dónde va la pieza y las barras son el sonido real (se analiza lo que suena).
 *  - Entra y sale con un fundido; sigue sonando al cambiar de página.
 *  - Cede el paso: si empieza un video u otro audio de la página, o se oculta la pestaña, se calla sola,
 *    y vuelve cuando eso termina (si era la música la que estaba sonando).
 *  - Si la persona la dejó encendida, en la visita siguiente vuelve con su primer toque en la página.
 */
const SRC = "/files/detras_de_la_ventana.mp3";
const KEY = "cr-musica";
const VOLUME = 0.55;
const BARS = 5;
const subscribe = (fn: () => void) => {
  window.addEventListener(SOUND_EVENT, fn);
  return () => window.removeEventListener(SOUND_EVENT, fn);
};

export function Ambient() {
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(false);
  const sound = useSyncExternalStore(subscribe, soundOn, () => true);
  const audio = useRef<HTMLAudioElement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const want = useRef(false); // la persona quiere música (aunque ahora esté cedida a un video)
  const yielded = useRef(0); // cuántas cosas la tienen callada (video, otro audio, pestaña oculta)
  const graph = useRef<{ ctx: AudioContext; gain: GainNode; an: AnalyserNode } | null>(null);

  // el audio y su análisis se crean recién con el primer toque (nada se descarga antes)
  const ensure = () => {
    if (audio.current) return audio.current;
    const a = new Audio(SRC);
    a.loop = true;
    a.preload = "auto";
    audio.current = a;
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const an = ctx.createAnalyser();
      an.fftSize = 64;
      an.smoothingTimeConstant = 0.82;
      ctx.createMediaElementSource(a).connect(gain).connect(an).connect(ctx.destination);
      graph.current = { ctx, gain, an };
    } catch {
      a.volume = VOLUME; // sin Web Audio: suena igual, sin fundido ni barras
    }
    return a;
  };
  const fade = (to: number, ms: number) => {
    const g = graph.current;
    if (!g) return;
    const t = g.ctx.currentTime;
    g.gain.gain.cancelScheduledValues(t);
    g.gain.gain.setValueAtTime(g.gain.gain.value, t);
    g.gain.gain.linearRampToValueAtTime(to, t + ms / 1000);
  };
  const start = () => {
    const a = ensure();
    void graph.current?.ctx.resume();
    a.play()
      .then(() => {
        fade(VOLUME, 1400);
        setOn(true);
      })
      .catch(() => setOn(false));
  };
  const stop = (ms = 700) => {
    const a = audio.current;
    if (!a) return;
    fade(0, ms);
    setOn(false);
    window.setTimeout(() => {
      if (!want.current || yielded.current > 0) a.pause();
    }, ms + 40);
  };
  const apply = () => (want.current && yielded.current === 0 && soundOn() ? start() : stop());

  const toggle = () => {
    want.current = !want.current;
    try {
      localStorage.setItem(KEY, want.current ? "1" : "0");
    } catch {}
    yielded.current = 0;
    apply();
  };

  // ceder el paso a videos, a otros audios y a la pestaña oculta
  useEffect(() => {
    if (embedded()) return; // dentro de la vista viva del menú no suena nada
    const others = new Set<EventTarget>();
    const sync = (hold: boolean, who: EventTarget) => {
      if (hold) others.add(who);
      else others.delete(who);
      yielded.current = others.size;
      apply();
    };
    const onPlay = (e: Event) => e.target !== audio.current && e.target instanceof HTMLMediaElement && sync(true, e.target);
    const onEnd = (e: Event) => e.target !== audio.current && sync(false, e.target!);
    const onVideo = (e: Event) => sync((e as CustomEvent<boolean>).detail, window);
    const onVis = () => sync(document.hidden, document);
    // quedó encendida la vez pasada: vuelve con el primer gesto (los navegadores no dejan antes)
    const first = () => {
      removeEventListener("pointerdown", first, true);
      removeEventListener("keydown", first, true);
      let saved = false;
      try {
        saved = localStorage.getItem(KEY) === "1";
      } catch {}
      if (saved && !want.current) {
        want.current = true;
        apply();
      }
    };
    document.addEventListener("play", onPlay, true);
    document.addEventListener("pause", onEnd, true);
    document.addEventListener("ended", onEnd, true);
    addEventListener("cr:video", onVideo);
    document.addEventListener("visibilitychange", onVis);
    addEventListener("pointerdown", first, true);
    addEventListener("keydown", first, true);
    return () => {
      document.removeEventListener("play", onPlay, true);
      document.removeEventListener("pause", onEnd, true);
      document.removeEventListener("ended", onEnd, true);
      removeEventListener("cr:video", onVideo);
      document.removeEventListener("visibilitychange", onVis);
      removeEventListener("pointerdown", first, true);
      removeEventListener("keydown", first, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // el botón general de sonido también manda sobre la música
  useEffect(() => {
    if (audio.current) apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sound]);

  // mientras suena: el anillo sigue la pieza y las barras, el espectro (escrito directo en CSS, sin re-render)
  useEffect(() => {
    const el = root.current;
    if (!on || !el) return;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const data = new Uint8Array(32);
    let raf = 0;
    const tick = () => {
      const a = audio.current;
      if (a?.duration) el.style.setProperty("--p", (a.currentTime / a.duration).toFixed(4));
      const an = graph.current?.an;
      if (an && !calm) {
        an.getByteFrequencyData(data);
        for (let i = 0; i < BARS; i++) {
          const from = 1 + i * 3;
          const v = (data[from] + data[from + 1] + data[from + 2]) / 765;
          el.style.setProperty(`--b${i}`, Math.min(1, 0.12 + v * 1.25).toFixed(3));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  return (
    <div ref={root} className={s.ambient} data-on={on ? "" : undefined} data-open={open ? "" : undefined} data-site-chrome>
      <button
        type="button"
        className={s.disc}
        aria-pressed={on}
        aria-label={on ? "Música de fondo sonando: «Detrás de la ventana», de Cali Rivera. Pausar" : "Poner música de fondo: «Detrás de la ventana», de Cali Rivera"}
        onClick={toggle}
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <svg className={s.ring} viewBox="0 0 48 48" aria-hidden>
          <circle cx="24" cy="24" r="22" />
          <circle cx="24" cy="24" r="22" pathLength={1} />
        </svg>
        <span className={s.bars} aria-hidden>
          {Array.from({ length: BARS }, (_, i) => (
            <i key={i} style={{ "--i": i } as React.CSSProperties} />
          ))}
        </span>
      </button>
      <p className={s.label} aria-hidden>
        <span className={s.state}>{on ? "Sonando" : "Música"}</span>
        <span className={s.title}>Detrás de la ventana</span>
        <span className={s.by}>Cali Rivera · 2005</span>
      </p>
    </div>
  );
}
