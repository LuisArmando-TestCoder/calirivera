"use client";
import { useEffect, useRef } from "react";
import { SOURCE_LABEL } from "@/lib/memoria/layout";
import s from "./memoria.module.scss";

export type ViewerItem = {
  slug: string;
  href: string;
  title: string;
  caption: string;
  year: string;
  kind: string;
  place: string;
  source: string;
  sourceUrl: string;
  src: string;
  widths: number[];
  w: number;
  h: number;
  ai: boolean;
  alt: string;
};

const set = (src: string, widths: number[], ext: string) =>
  widths.length && /-\d+\.jpg$/.test(src) ? widths.map((w) => `${src.replace(/-\d+\.jpg$/, `-${w}.${ext}`)} ${w}w`).join(", ") : undefined;

/** Visor de un recuerdo: <dialog> nativo (foco atrapado por el navegador, Esc cierra, top layer). */
export function MemoriaViewer({ item, onClose, onStep }: { item: ViewerItem | null; onClose: () => void; onStep: (d: 1 | -1) => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (item && !d.open) d.showModal();
    if (!item && d.open) d.close();
  }, [item]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") onStep(1);
      if (e.key === "ArrowLeft") onStep(-1);
    };
    d.addEventListener("keydown", onKey);
    return () => d.removeEventListener("keydown", onKey);
  }, [onStep]);

  const heading = item ? item.title || (item.year ? `Recuerdo de ${item.year}` : "Recuerdo") : "";
  return (
    <dialog
      ref={ref}
      className={s.viewer}
      aria-labelledby="mv-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      {item && (
        <div className={s.vInner} key={item.slug}>
          <figure className={s.vFigure} style={{ aspectRatio: `${item.w} / ${item.h}` }}>
            <picture>
              {set(item.src, item.widths, "avif") && <source type="image/avif" srcSet={set(item.src, item.widths, "avif")} sizes="(min-width: 60em) 62vw, 100vw" />}
              {set(item.src, item.widths, "webp") && <source type="image/webp" srcSet={set(item.src, item.widths, "webp")} sizes="(min-width: 60em) 62vw, 100vw" />}
              { }
              <img src={item.src} alt={item.alt} width={item.w} height={item.h} />
            </picture>
          </figure>
          <div className={s.vText}>
            <p className={s.vMeta}>
              {[item.year, item.kind, item.place].filter(Boolean).join(" · ")}
            </p>
            <h2 id="mv-title" className={s.vTitle}>
              {heading}
            </h2>
            {item.caption && <p className={s.vCaption}>{item.caption}</p>}
            {item.ai && (
              <p className={s.vNotice}>Esta imagen pasó por inteligencia artificial en el sitio actual. Puede no ser fiel al original.</p>
            )}
            <p className={s.vSource}>
              Fuente: {SOURCE_LABEL[item.source] ?? item.source}
              {item.sourceUrl && (
                <>
                  {" · "}
                  <a href={item.sourceUrl} target="_blank" rel="noopener">
                    ver original
                  </a>
                </>
              )}
            </p>
            <div className={s.vActions}>
              <button type="button" onClick={() => onStep(-1)} aria-label="Recuerdo anterior">
                ←
              </button>
              <button type="button" onClick={() => onStep(1)} aria-label="Recuerdo siguiente">
                →
              </button>
              <a href={item.href} className={s.vOpen}>
                Abrir ficha
              </a>
              <button type="button" className={s.vClose} onClick={() => ref.current?.close()}>
                Cerrar <kbd>Esc</kbd>
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
