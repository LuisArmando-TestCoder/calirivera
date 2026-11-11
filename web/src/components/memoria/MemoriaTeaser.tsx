import Link from "next/link";
import type { CSSProperties } from "react";
import { listMemories } from "@/lib/content/repo";
import type { Memory } from "@/lib/content/types";
import { hash, KIND_LABEL, layoutMemories, srcsetOf, yearOf } from "@/lib/memoria/layout";
import { archiveNo } from "./MemoryCard";
import { MemoriaStrip } from "./MemoriaStrip";
import s from "./teaser.module.scss";

/** Los recuerdos para la home: dos por quinquenio (destacados y más grandes primero), en orden. */
export async function memoriaPicks(n = 16) {
  const all = await listMemories();
  const order = new Map<string, number>();
  let i = 0;
  for (const y of layoutMemories(all)) for (const p of y.items) order.set(p.memory.id, ++i);
  const real = all.filter((m) => !m.aiAltered && yearOf(m) !== null);
  const buckets = new Map<number, Memory[]>();
  for (const m of real) {
    const b = Math.floor(yearOf(m)! / 5) * 5;
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(m);
  }
  const picks = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, ms]) =>
      ms
        .slice()
        .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (b.image.width ?? 0) - (a.image.width ?? 0) || hash(a.slug) - hash(b.slug))
        .slice(0, 2),
    )
    .slice(0, n)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const years = real.map(yearOf).filter((y): y is number => y !== null);
  return { picks, order, total: all.length, first: Math.min(...years), last: Math.max(...years) };
}

/**
 * Teaser en la home: la cinta de McCormack con los números de archivo de la muestra de Hollywood.
 * Sin JS es una fila con scroll horizontal; con JS deriva sola, y con GPU las fotos son tela.
 */
export async function MemoriaTeaser() {
  const { picks, order, total, first, last } = await memoriaPicks();
  if (picks.length < 4) return null;
  const items = (clone: boolean) =>
    picks.map((m) => {
      const w = m.image.width ?? 800;
      const h = m.image.height ?? 800;
      const ar = Math.min(1.45, Math.max(0.72, w / h));
      const yl = `${m.yearApprox ? "c. " : ""}${m.year}`;
      const label = m.title || [KIND_LABEL[m.kind], yl].filter(Boolean).join(", ");
      return (
        <div
          key={`${clone ? "c" : "o"}${m.id}`}
          className={s.item}
          data-mem={m.slug}
          data-label={label}
          data-fire={m.lostInFire ? "" : undefined}
          style={{ "--ar": ar, "--rot": `${((hash(m.slug) % 30) - 15) / 10}deg` } as CSSProperties}
        >
          <Link
            href={`/memoria/${m.slug}`}
            className={s.link}
            tabIndex={clone ? -1 : undefined}
            aria-label={`${label}${m.title ? `, ${yl}` : ""}`}
            data-src={m.image.src}
            data-widths={m.image.widths?.join(",") ?? ""}
            data-w={w}
            data-h={h}
          >
            <span className={s.frame} data-gl-frame style={{ "--tint": m.image.color ?? "transparent", ...(m.image.placeholder ? { "--ph": `url("${m.image.placeholder}")` } : {}) } as CSSProperties}>
              <picture>
                {srcsetOf(m.image.src, m.image.widths, "avif") && <source type="image/avif" srcSet={srcsetOf(m.image.src, m.image.widths, "avif")} sizes="22rem" />}
                {srcsetOf(m.image.src, m.image.widths, "webp") && <source type="image/webp" srcSet={srcsetOf(m.image.src, m.image.widths, "webp")} sizes="22rem" />}
                { }
                <img src={m.image.src} alt={clone ? "" : m.image.alt || label} width={w} height={h} loading="lazy" decoding="async" />
              </picture>
            </span>
          </Link>
          <p className={s.cap} aria-hidden>
            <span>{archiveNo(order.get(m.id) ?? 0)}</span> <span>{yl}</span>
          </p>
        </div>
      );
    });
  return (
    <section className={s.teaser} aria-labelledby="home-memoria" id="memoria">
      <div className={s.head}>
        <p className={s.kicker}>Archivo visual · {first}–{last}</p>
        <h2 id="home-memoria" className={s.h2}>
          Memoria <em>del Taller</em>
        </h2>
        <p className={s.lead}>{total} fotos rescatadas del sitio de siempre: obras, muestras, el Taller y su gente. Cada una vuelve de la ceniza al llegar.</p>
        <Link href="/memoria" className={s.cta}>
          Entrar a la memoria <span aria-hidden>→</span>
        </Link>
      </div>
      <MemoriaStrip>
        <div className={s.set}>{items(false)}</div>
        <div className={s.set} aria-hidden>
          {items(true)}
        </div>
      </MemoriaStrip>
    </section>
  );
}
