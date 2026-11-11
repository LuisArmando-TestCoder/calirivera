"use client";
import { useEffect, useRef, useState } from "react";
import s from "./Blocks.module.scss";

/** YouTube «lite»: miniatura + botón; el iframe se carga solo al tocar (INP/LCP intactos). */
export function LiteVideo({ url, title, poster }: { url: string; title?: string; poster?: string }) {
  const id = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)?.[1];
  const [on, setOn] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // El video solo existe mientras se lo está mirando: si se sale de pantalla, se cambia de página (Next guarda
  // la página anterior escondida, con el reproductor vivo) o se oculta la pestaña, vuelve a ser una miniatura.
  useEffect(() => {
    if (!on) return;
    const el = box.current;
    const off = () => setOn(false);
    const io = new IntersectionObserver(([e]) => !e.isIntersecting && off(), { threshold: 0 });
    if (el) io.observe(el);
    const onVis = () => document.hidden && off();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      off(); // la página se escondió o se desmontó
    };
  }, [on]);
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
  if (vimeo)
    return (
      <div className={s.video}>
        <iframe src={`https://player.vimeo.com/video/${vimeo}?dnt=1`} title={title ?? "Video"} loading="lazy" allow="fullscreen; picture-in-picture" allowFullScreen />
      </div>
    );
  if (!id) return <a href={url}>{title ?? "Ver video"}</a>;
  const thumb = poster ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return (
    <div className={s.video} ref={box}>
      {on ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title ?? "Video"}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button type="button" className={s.videoBtn} onClick={() => setOn(true)} aria-label={`Reproducir ${title ?? "video"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb} alt="" loading="lazy" width={480} height={360} />
          <span className={s.play} aria-hidden>
            <svg viewBox="0 0 24 24" width="28" height="28"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
          </span>
        </button>
      )}
    </div>
  );
}
