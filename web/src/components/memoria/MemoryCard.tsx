import type { CSSProperties } from "react";
import { EditableImage, EditableText } from "@/components/cms/editable";
import { KIND_LABEL, srcsetOf, type Placed } from "@/lib/memoria/layout";
import s from "./memoria.module.scss";

/**
 * Un recuerdo en la trama. Es un enlace real a su ficha (/memoria/<slug>) — sin JS funciona igual.
 * Los data-* alimentan el visor (diálogo), los filtros y la capa WebGPU sin mandar JSON aparte.
 */
export function MemoryCard({ p, priority = false }: { p: Placed; priority?: boolean }) {
  const m = p.memory;
  const path = `memories/${m.id}`;
  const img = m.image;
  const w = img.width ?? 1000;
  const h = img.height ?? 1000;
  const sizes = `(min-width: 60em) ${Math.round((p.c / 12) * 80)}vw, ${Math.round((p.cm / 6) * 100)}vw`;
  const style = {
    "--c": p.c,
    "--r": p.r,
    "--cm": p.cm,
    "--rm": p.rm,
    "--dx": `${p.dx}%`,
    "--dy": `${p.dy}%`,
    "--rot": `${p.rot}deg`,
    "--tint": img.color ?? "var(--c-linea)",
    ...(img.placeholder ? { "--ph": `url("${img.placeholder}")` } : {}),
  } as CSSProperties;
  const yearLabel = m.year ? `${m.yearApprox ? "c. " : ""}${m.year}` : "";
  const label = m.title || m.caption || (yearLabel ? `Recuerdo de ${yearLabel}` : "Recuerdo");
  return (
    <div
      className={s.cell}
      style={style}
      data-mem={m.slug}
      data-kind={m.kind}
      data-collection={m.collectionId ?? ""}
      data-lead={p.lead ? "" : undefined}
      data-ai={m.aiAltered ? "" : undefined}
      data-fire={m.lostInFire ? "" : undefined}
    >
      <a
        href={`/memoria/${m.slug}`}
        className={s.card}
        data-mem-link
        data-title={m.title ?? ""}
        data-caption={m.caption ?? ""}
        data-year={yearLabel}
        data-kind-label={KIND_LABEL[m.kind] ?? ""}
        data-place={m.place ?? ""}
        data-source={m.source}
        data-source-url={m.sourceUrl ?? ""}
        data-src={img.src}
        data-widths={img.widths?.join(",") ?? ""}
        data-w={w}
        data-h={h}
        aria-label={`${label}${yearLabel && !label.includes(yearLabel) ? `, ${yearLabel}` : ""}`}
      >
        <span className={s.frame}>
          <picture>
            {srcsetOf(img.src, img.widths, "avif") && <source type="image/avif" srcSet={srcsetOf(img.src, img.widths, "avif")} sizes={sizes} />}
            {srcsetOf(img.src, img.widths, "webp") && <source type="image/webp" srcSet={srcsetOf(img.src, img.widths, "webp")} sizes={sizes} />}
            <EditableImage
              path={`${path}#image`}
              image={{ ...img, width: w, height: h, alt: img.alt || label }}
              sizes={sizes}
              priority={priority}
              className={s.img}
            />
          </picture>
        </span>
      </a>
      <div className={s.caption}>
        {m.title ? <EditableText path={`${path}#title`} value={m.title} className={s.capTitle} /> : null}
        <span className={s.capMeta}>
          {yearLabel && <span>{yearLabel}</span>}
          {KIND_LABEL[m.kind] && <span>{KIND_LABEL[m.kind]}</span>}
          {m.aiAltered && <span className={s.aiTag} title="La foto fue alterada con inteligencia artificial">IA</span>}
        </span>
      </div>
    </div>
  );
}
