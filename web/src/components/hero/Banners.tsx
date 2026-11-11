import Link from "next/link";
import { EditableText } from "@/components/cms/editable";
import { NarrationSlot } from "@/components/narration/NarrationSlot";
import s from "./Banners.module.scss";
import { HeroStage, type StageSlide } from "./HeroStage";

/**
 * Hero de inicio: el nombre colgado como dos estandartes textiles (la obra de Cali que ganó
 * el Primer Lugar Iberoamericano en Arte Textil, 2010). Cada letra es una puntada vertical.
 * Al cargar, los estandartes se desenrollan (CSS, sin JS → no retrasa el LCP);
 * con el scroll se mecen según la velocidad (variable --velocity que escribe MotionRoot).
 */
type MemoriaLink = { count: number; thumbs: { src: string; w: number; h: number }[] };

export function Banners({
  name,
  tagline,
  cta,
  path,
  memoria,
  stage,
}: {
  name: string;
  tagline: string;
  cta?: { label: string; href: string };
  path: string;
  /** botón secundario hacia /memoria, con tres fotos en abanico */
  memoria?: MemoriaLink;
  /** exposiciones que pasan de fondo, quemándose al revés */
  stage?: StageSlide[];
}) {
  const [first, ...rest] = name.split(" ");
  const last = rest.join(" ") || first;
  const letters = (w: string) =>
    [...w].map((ch, i) => (
      <span key={i} className={s.letter} style={{ "--i": i } as React.CSSProperties}>{ch}</span>
    ));
  return (
    <section className={s.hero} aria-labelledby="hero-title">
      {stage && stage.length > 0 && <HeroStage slides={stage} />}
      <NarrationSlot beat="01" />
      <div className={s.rod} aria-hidden />
      <h1 id="hero-title" className={s.banners} data-fx="off">
        <span className="visually-hidden">{name}</span>
        <span className={`${s.banner} ${s.one}`} aria-hidden data-skew>
          <span className={s.cloth}>{letters(first)}</span>
        </span>
        <span className={`${s.banner} ${s.two}`} aria-hidden data-skew>
          <span className={s.cloth}>{letters(last)}</span>
        </span>
      </h1>
      <div className={s.copy}>
        <EditableText path={`${path}.subtitle`} value={tagline} as="p" className={s.tagline} />
        <div className={s.ctas}>
          {cta && (
            <Link href={cta.href} className={s.cta}>
              <span>{cta.label}</span>
            </Link>
          )}
          {memoria && (
            <Link href="/memoria" className={s.cta2}>
              <span className={s.fan} aria-hidden>
                {memoria.thumbs.map((t, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={t.src} src={t.src} alt="" width={t.w} height={t.h} decoding="async" style={{ "--i": i } as React.CSSProperties} />
                ))}
              </span>
              <span className={s.cta2Text}>
                Memoria del Taller
                <small>{memoria.count} fotos desde 1993</small>
              </span>
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
