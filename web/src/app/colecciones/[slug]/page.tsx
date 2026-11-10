import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ViewTransition } from "react";
import { EditableList, EditableText } from "@/components/cms/editable";
import { BlockView } from "@/components/layout-engine/Blocks";
import { SectionRenderer } from "@/components/layout-engine/SectionRenderer";
import { ArtImage } from "@/components/media/ArtImage";
import { NarrationSlot } from "@/components/narration/NarrationSlot";
import { getCollection, listArtworks, listCollections, listSlugs } from "@/lib/content/repo";
import { COLLECTIONS } from "@/lib/content/types";
import s from "./coleccion.module.scss";

const EMPTY = "__vacio";
const BEAT: Record<string, string> = {
  atmosfera: "11", "musas-del-cantaro": "12", "suenos-en-azul": "13", "detras-de-la-ventana": "14",
  plegaria: "15", exvotos: "16", "la-cofradia": "17",
};

export async function generateStaticParams() {
  const slugs = await listSlugs(COLLECTIONS.collections);
  return (slugs.length ? slugs : [EMPTY]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/colecciones/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const c = slug === EMPTY ? null : await getCollection(slug);
  return { title: c?.title ?? "Colecciones", description: c?.statement?.slice(0, 160) };
}

export default async function Coleccion({ params }: PageProps<"/colecciones/[slug]">) {
  const { slug } = await params;
  const c = slug === EMPTY ? null : await getCollection(slug);
  if (!c) notFound();
  const [works, all] = await Promise.all([listArtworks(c.id), listCollections()]);
  const pos = all.findIndex((x) => x.id === c.id);
  const next = all[(pos + 1) % all.length];
  const path = `collections/${c.id}`;
  const body = c.body ?? [];
  const longText = body.filter((b) => b.type === "heading" || b.type === "paragraph" || b.type === "quote");
  const media = body.filter((b) => !(longText as typeof body).includes(b));

  return (
    <article className={s.page}>
      <NarrationSlot beat={BEAT[c.slug] ?? ""} />
      <header className={s.hero}>
        <p className={s.period}>{c.period}</p>
        <EditableText path={`${path}#title`} value={c.title} as="h1" className={s.title} />
        {c.subtitle && <EditableText path={`${path}#subtitle`} value={c.subtitle} as="p" className={s.subtitle} />}
        {c.technique && <p className={s.tech}>{c.technique}</p>}
      </header>

      {c.statement && (
        <section className={s.statement}>
          <div data-reveal="lines">
            <EditableText path={`${path}#statement`} value={c.statement} as="p" multiline className={s.statementText} />
          </div>
        </section>
      )}

      {works.length > 0 && (
        <section className={s.works} aria-label={`Obras de ${c.title}`}>
          <EditableList path={`${path}#artworkIds`} itemType="artwork" className={s.wall}>
            {works.map((w, i) => (
              <Link key={w.id} href={`/obra/${w.slug}`} className={s.work} style={{ "--i": i % 6 } as React.CSSProperties}>
                <ViewTransition name={`obra-${w.slug}`}>
                  <div>
                    <ArtImage image={w.images[0]} path={`artworks/${w.id}#images.0`} sizes="(min-width: 60em) 30vw, 50vw" />
                  </div>
                </ViewTransition>
                <span className={s.workLabel}>
                  <span>{w.title}</span>
                  {w.year && <span className={s.workYear}>{String(w.year)}</span>}
                </span>
              </Link>
            ))}
          </EditableList>
        </section>
      )}

      {longText.length > 0 && (
        <SectionRenderer
          section={{ id: "texto", layout: "editorial-columns", blocks: longText }}
          base={`${path}#body`}
        />
      )}

      {(media.length > 0 || c.catalogUrl) && (
        <section className={s.extras}>
          {media.map((b) => (
            <BlockView key={b.id} block={b} base={`${path}#body`} index={body.indexOf(b)} />
          ))}
          {c.catalogUrl && (
            <a href={c.catalogUrl} className={s.catalog} target="_blank" rel="noopener">
              <span className={s.catalogLabel}>Catálogo completo</span>
              <span className={s.catalogNote}>PDF con fichas técnicas</span>
            </a>
          )}
        </section>
      )}

      {next && next.id !== c.id && (
        <Link href={`/colecciones/${next.slug}`} className={s.next}>
          <span className={s.nextLabel}>Siguiente colección</span>
          <span className={s.nextTitle}>{next.title}</span>
        </Link>
      )}
    </article>
  );
}
