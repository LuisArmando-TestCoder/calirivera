import Link from "next/link";
import type { CSSProperties } from "react";
import { listMemories } from "@/lib/content/repo";
import { hash, srcsetOf, yearOf } from "@/lib/memoria/layout";
import s from "./teaser.module.scss";

/**
 * Teaser en la home: una cuerda de fotos viejas, desvaídas, que recuperan el color al pasar.
 * Solo DOM y CSS (no carga three en la home). Elige una foto auténtica por década.
 */
export async function MemoriaTeaser() {
  const all = (await listMemories()).filter((m) => !m.aiAltered);
  if (all.length < 4) return null;
  const byDecade = new Map<number, typeof all>();
  for (const m of all) {
    const y = yearOf(m);
    if (!y) continue;
    const d = Math.floor(y / 5) * 5;
    if (!byDecade.has(d)) byDecade.set(d, []);
    byDecade.get(d)!.push(m);
  }
  const picks = [...byDecade.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, ms]) =>
      ms.slice().sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (b.image.width ?? 0) - (a.image.width ?? 0) || hash(a.slug) - hash(b.slug))[0],
    )
    .slice(0, 8);
  const years = all.map(yearOf).filter((y): y is number => y !== null);
  return (
    <section className={s.teaser} aria-labelledby="home-memoria">
      <div className={s.head}>
        <h2 id="home-memoria" className={s.h2}>
          Memoria del Taller
        </h2>
        <p className={s.lead}>
          {all.length} fotos de {Math.min(...years)} a {Math.max(...years)}, rescatadas del sitio de siempre.
        </p>
        <Link href="/memoria" className={s.cta}>
          Entrar a la memoria <span aria-hidden>→</span>
        </Link>
      </div>
      <ul className={s.rope}>
        {picks.map((m, i) => {
          const w = m.image.width ?? 800;
          const h = m.image.height ?? 800;
          return (
            <li key={m.id} style={{ "--i": i, "--ar": `${w} / ${h}`, "--rot": `${((hash(m.slug) % 50) - 25) / 10}deg` } as CSSProperties}>
              <Link href={`/memoria/${m.slug}`} className={s.item}>
                <picture>
                  {srcsetOf(m.image.src, m.image.widths, "avif") && <source type="image/avif" srcSet={srcsetOf(m.image.src, m.image.widths, "avif")} sizes="16rem" />}
                  {srcsetOf(m.image.src, m.image.widths, "webp") && <source type="image/webp" srcSet={srcsetOf(m.image.src, m.image.widths, "webp")} sizes="16rem" />}
                  { }
                  <img src={m.image.src} alt={m.image.alt || m.title || `Recuerdo de ${m.year}`} width={w} height={h} loading="lazy" />
                </picture>
                <span className={s.year}>{m.year}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
