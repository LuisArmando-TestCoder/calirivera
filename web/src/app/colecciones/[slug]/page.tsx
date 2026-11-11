import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbLd, collectionLd } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, ViewTransition } from "react";
import { EditableList, EditableText } from "@/components/cms/editable";
import { BlockView } from "@/components/layout-engine/Blocks";
import { SectionRenderer } from "@/components/layout-engine/SectionRenderer";
import { ArtImage } from "@/components/media/ArtImage";
import { GLReveal } from "@/components/media/GLReveal";
import { NarrationSlot } from "@/components/narration/NarrationSlot";
import { getCollection, listArtworks, listCollections, listMemories, listSlugs } from "@/lib/content/repo";
import { COLLECTIONS } from "@/lib/content/types";
import s from "./coleccion.module.scss";
import { RevealLines } from "@/components/motion/RevealLines";

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
  return {
    title: c?.title ?? "Colecciones",
    description: c?.statement?.replace(/\s+/g, " ").slice(0, 160),
    openGraph: c?.cover ? { type: "article", images: [{ url: c.cover.src, alt: c.cover.alt || c.title }] } : undefined,
  };
}

async function ColeccionContent({ params }: { params: PageProps<"/colecciones/[slug]">["params"] }) {
  const { slug } = await params;
  const c = slug === EMPTY ? null : await getCollection(slug);
  if (!c) notFound();
  const [works, all, memories] = await Promise.all([listArtworks(c.id), listCollections(), listMemories()]);
  const memCount = memories.filter((m) => m.collectionId === c.id).length;
  const pos = all.findIndex((x) => x.id === c.id);
  const next = all[(pos + 1) % all.length];
  const path = `collections/${c.id}`;
  const body = c.body ?? [];
  const longText = body.filter((b) => b.type === "heading" || b.type === "paragraph" || b.type === "quote");
  const media = body.filter((b) => !(longText as typeof body).includes(b));

  return (
    <GLReveal as="article" className={s.page} slot={512}>
      <JsonLd data={collectionLd(c, works)} />
      <JsonLd data={breadcrumbLd([{ name: "Colecciones", path: "/colecciones" }, { name: c.title, path: `/colecciones/${c.slug}` }])} />
      <NarrationSlot beat={BEAT[c.slug] ?? ""} />
      <header className={s.hero}>
        <p className={s.period}>{c.period}</p>
        <EditableText path={`${path}#title`} value={c.title} as="h1" className={s.title} />
        {c.subtitle && <EditableText path={`${path}#subtitle`} value={c.subtitle} as="p" className={s.subtitle} />}
        {c.technique && <p className={s.tech}>{c.technique}</p>}
      </header>

      {c.statement && (
        <section className={s.statement}>
          <RevealLines>
            <EditableText path={`${path}#statement`} value={c.statement} as="p" multiline className={s.statementText} />
          </RevealLines>
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

      {(media.length > 0 || c.catalogUrl || memCount > 0) && (
        <section className={s.extras}>
          {media.map((b) => (
            <BlockView key={b.id} block={b} base={`${path}#body`} index={body.indexOf(b)} />
          ))}
          {c.catalogUrl && (
            <a href={c.catalogUrl} className={s.catalog} data-pdf-title={`Catálogo ${c.title}`}>
              <span className={s.catalogLabel}>Catálogo completo</span>
              <span className={s.catalogNote}>PDF con fichas técnicas</span>
            </a>
          )}
          {memCount > 0 && (
            <Link href={`/memoria?c=${c.id}`} className={s.catalog}>
              <span className={s.catalogLabel}>Recuerdos</span>
              <span className={s.catalogNote}>
                {memCount} {memCount === 1 ? "foto" : "fotos"} de esta colección en la Memoria del Taller
              </span>
            </Link>
          )}
        </section>
      )}

      {next && next.id !== c.id && (
        <Link href={`/colecciones/${next.slug}`} className={s.next}>
          <span className={s.nextLabel}>Siguiente colección</span>
          <span className={s.nextTitle}>{next.title}</span>
        </Link>
      )}
    </GLReveal>
  );
}

/**
 * `params` se lee dentro de <Suspense>: los slugs conocidos se prerenderizan igual
 * (generateStaticParams) y una navegación a un slug nuevo (recién creado en el CMS)
 * muestra el cascarón al instante en vez de bloquear.
 */
export default function Coleccion(props: PageProps<"/colecciones/[slug]">) {
  return (
    <Suspense fallback={<article className={s.page} aria-busy="true" />}>
      <ColeccionContent params={props.params} />
    </Suspense>
  );
}
