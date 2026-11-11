import type { Metadata } from "next";
import Link from "next/link";
import { EditableText } from "@/components/cms/editable";
import { BlockView } from "@/components/layout-engine/Blocks";
import { getPage, listPress } from "@/lib/content/repo";
import type { AnyBlock, PressArticle } from "@/lib/content/types";
import s from "./puntos.module.scss";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPage("puntos-de-vista");
  return { title: "Puntos de vista", description: p?.description };
}

const yearOf = (n: PressArticle) => n.publishedAt.slice(0, 4);

/**
 * Puntos de vista: la crítica y la prensa, como un índice de hemeroteca.
 * Diagrama de Gutenberg en cada fila: arriba a la izquierda el año (fijo mientras se recorre su grupo),
 * en el centro medio y fecha → titular → firma y bajada, y abajo a la derecha «Leer la nota».
 */
export default async function PuntosDeVista() {
  const [page, notes] = await Promise.all([getPage("puntos-de-vista"), listPress()]);
  const years = [...new Set(notes.map(yearOf))];
  const groups = years.map((y) => ({ y, items: notes.filter((n) => yearOf(n) === y) }));
  const outlets = new Set(notes.map((n) => n.outlet)).size;
  const sections = page?.sections ?? [];
  const intro = sections.findIndex((x) => x.id === "intro");
  const rest = sections.map((sec, i) => ({ sec, i })).filter(({ sec }) => sec.id !== "intro");
  return (
    <>
      <header className={s.hero}>
        <p className={s.kicker}>
          <Link href="/trayectoria-and-entrevistas">Trayectoria</Link> · Crítica y prensa
        </p>
        <h1 className={s.title}>
          {page?.hero?.title ?? "Puntos de vista"}
        </h1>
        <div className={s.heroFoot}>
          {intro >= 0 && (
            <div className={s.intro}>
              {(sections[intro].blocks as AnyBlock[]).map((b, i) => (
                <BlockView key={b.id ?? i} block={b} base={`pages/puntos-de-vista#sections.${intro}.blocks`} index={i} />
              ))}
            </div>
          )}
          {years.length > 0 && (
            <dl className={s.stats}>
              <div><dt>Notas</dt><dd>{notes.length}</dd></div>
              <div><dt>Medios</dt><dd>{outlets}</dd></div>
              <div><dt>Años</dt><dd>{years.at(-1)}–{years[0].slice(2)}</dd></div>
            </dl>
          )}
        </div>
      </header>

      <div className={s.index}>
        {groups.map(({ y, items }) => (
          <section key={y} className={s.year} aria-labelledby={`pv-${y}`}>
            <h2 id={`pv-${y}`} className={s.yearLabel}>
              <span>{y}</span>
              <small>{items.length === 1 ? "1 nota" : `${items.length} notas`}</small>
            </h2>
            <ol className={s.list}>
              {items.map((n) => (
                <li key={n.id}>
                  <Link href={`/puntos-de-vista/${n.slug}`} className={s.note}>
                    <p className={s.meta}>
                      <EditableText path={`press/${n.id}#outlet`} value={n.outlet} className={s.outlet} />
                      <time dateTime={n.publishedAt}>{n.dateLabel ?? y}</time>
                    </p>
                    <EditableText path={`press/${n.id}#title`} value={n.title} as="h3" className={s.headline} />
                    {(n.author || n.excerpt) && (
                      <p className={s.dek}>
                        {n.author && <span className={s.by}>{n.author}. </span>}
                        {n.excerpt}
                      </p>
                    )}
                    <span className={s.read} aria-hidden>
                      Leer la nota <span className={s.arrow}>→</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      {rest.map(({ sec, i }) => (
        <section key={sec.id} className={s.archive}>
          {(sec.blocks as AnyBlock[]).map((b, k) => (
            <BlockView key={b.id ?? k} block={b} base={`pages/puntos-de-vista#sections.${i}.blocks`} index={k} />
          ))}
        </section>
      ))}
    </>
  );
}
