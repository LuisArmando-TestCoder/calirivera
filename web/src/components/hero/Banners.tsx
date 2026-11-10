import Link from "next/link";
import { EditableText } from "@/components/cms/editable";
import { NarrationSlot } from "@/components/narration/NarrationSlot";
import s from "./Banners.module.scss";

/**
 * Hero de inicio: el nombre colgado como dos estandartes textiles (la obra de Cali que ganó
 * el Primer Lugar Iberoamericano en Arte Textil, 2010). Cada letra es una puntada vertical.
 * Al cargar, los estandartes se desenrollan (CSS, sin JS → no retrasa el LCP);
 * con el scroll se mecen según la velocidad (variable --velocity que escribe MotionRoot).
 */
export function Banners({ name, tagline, cta, path }: { name: string; tagline: string; cta?: { label: string; href: string }; path: string }) {
  const [first, ...rest] = name.split(" ");
  const last = rest.join(" ") || first;
  const letters = (w: string) =>
    [...w].map((ch, i) => (
      <span key={i} className={s.letter} style={{ "--i": i } as React.CSSProperties}>{ch}</span>
    ));
  return (
    <section className={s.hero} aria-labelledby="hero-title">
      <NarrationSlot beat="01" />
      <div className={s.rod} aria-hidden />
      <h1 id="hero-title" className={s.banners}>
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
        {cta && (
          <Link href={cta.href} className={s.cta}>
            <span>{cta.label}</span>
          </Link>
        )}
      </div>
    </section>
  );
}
