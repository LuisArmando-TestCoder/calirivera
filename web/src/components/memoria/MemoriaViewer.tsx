"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { sfx } from "@/components/sound/SoundRoot";
import { GLReveal } from "@/components/media/GLReveal";
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

const thumb = (it: ViewerItem) => {
  const w = it.widths.slice().sort((a, b) => a - b)[0];
  return w && /-\d+\.jpg$/.test(it.src) ? it.src.replace(/-\d+\.jpg$/, `-${w}.webp`) : it.src;
};

type YearCtx = { label: string; index: number; items: ViewerItem[] };

/**
 * Visor de un recuerdo: <dialog> nativo a pantalla completa (foco atrapado por el navegador, Esc cierra, top layer).
 * Ficha a la izquierda (título en itálica, «n / N» del año), foto a la derecha, tira del año abajo, X fija arriba.
 * La foto pasa por el mismo motor GPU que la trama (renace de la ceniza, calor del puntero): un <GLReveal>
 * propio dentro del diálogo, porque la capa superior tapa el canvas de la página.
 */
export function MemoriaViewer({
  item,
  year,
  onClose,
  onStep,
  onPick,
}: {
  item: ViewerItem | null;
  year: YearCtx | null;
  onClose: () => void;
  onStep: (d: 1 | -1) => void;
  onPick: (i: number) => void;
}) {
  const strip = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const cur = strip.current?.querySelector<HTMLElement>('[aria-current="true"]');
    cur?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [item?.slug]);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (item && !d.open) {
      d.showModal();
      sfx("bloom");
    }
    if (!item && d.open) {
      d.close();
      sfx("fold");
    }
  }, [item]);

  // Al salir de la página (navegación, o Next la esconde con <Activity> para volver rápido) el diálogo se cierra.
  // Si no, al volver queda «abierto» pero fuera de la capa superior: un diálogo no modal dibujado detrás de la trama.
  useEffect(() => {
    const d = ref.current;
    return () => {
      if (d?.open) d.close();
    };
  }, []);

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
        // clic en el vacío (fuera de la ficha, la foto y la tira) cierra
        const el = e.target as HTMLElement;
        if (el === ref.current || el.classList.contains(s.vStage)) ref.current?.close();
      }}
    >
      {item && (
        <GLReveal className={s.vStage} live slot={1024}>
        <button type="button" className={s.vX} onClick={() => ref.current?.close()} aria-label="Cerrar el visor">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          </svg>
          <kbd>Esc</kbd>
        </button>
        <div className={s.vInner} key={item.slug}>
          <div className={s.vText}>
            <p className={s.vMeta}>{[item.year, item.kind, item.place].filter(Boolean).join(" · ")}</p>
            <h2 id="mv-title" className={s.vTitle}>
              {heading}
            </h2>
            {item.caption && <p className={s.vCaption}>{item.caption}</p>}
            {year && year.items.length > 1 && (
              <p className={s.vCounter} aria-label={`Foto ${year.index + 1} de ${year.items.length} de ${year.label}`}>
                {year.index + 1} / {year.items.length}
              </p>
            )}
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
              <Link href={item.href} className={s.vOpen}>
                Abrir ficha
              </Link>
            </div>
          </div>
          <figure className={s.vFigure} data-mem={item.slug}>
            <picture>
              {set(item.src, item.widths, "avif") && <source type="image/avif" srcSet={set(item.src, item.widths, "avif")} sizes="(min-width: 60em) 58vw, 100vw" />}
              {set(item.src, item.widths, "webp") && <source type="image/webp" srcSet={set(item.src, item.widths, "webp")} sizes="(min-width: 60em) 58vw, 100vw" />}
              { }
              <img src={item.src} alt={item.alt} width={item.w} height={item.h} data-gl-frame />
            </picture>
          </figure>
          {year && year.items.length > 1 && (
            <ol ref={strip} className={s.vStrip} aria-label={`Fotos de ${year.label}`}>
              {year.items.map((it, i) => (
                <li key={it.slug}>
                  <button type="button" aria-current={i === year.index ? "true" : undefined} aria-label={`${it.title || "Recuerdo"} (${i + 1} de ${year.items.length})`} onClick={() => onPick(i)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb(it)} alt="" loading="lazy" decoding="async" width={56} height={56} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
        </GLReveal>
      )}
    </dialog>
  );
}
