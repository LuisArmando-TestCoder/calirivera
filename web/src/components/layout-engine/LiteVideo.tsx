"use client";
import { useState } from "react";
import s from "./Blocks.module.scss";

/** YouTube «lite»: miniatura + botón; el iframe se carga solo al tocar (INP/LCP intactos). */
export function LiteVideo({ url, title, poster }: { url: string; title?: string; poster?: string }) {
  const id = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)?.[1];
  const [on, setOn] = useState(false);
  if (!id) return <a href={url}>{title ?? "Ver video"}</a>;
  const thumb = poster ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return (
    <div className={s.video}>
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
