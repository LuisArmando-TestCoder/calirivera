import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, ViewTransition } from "react";
import { EditableText } from "@/components/cms/editable";
import { ArtImage } from "@/components/media/ArtImage";
import { JsonLd } from "@/components/seo/JsonLd";
import { artworkLd, breadcrumbLd } from "@/lib/seo";
import { ZoomView } from "@/components/media/ZoomView";
import { Faces } from "@/components/media/Faces";
import { GLReveal } from "@/components/media/GLReveal";
import { getArtwork, getCollection, listArtworks, listSlugs } from "@/lib/content/repo";
import { facesOf } from "@/lib/content/faces";
import { COLLECTIONS } from "@/lib/content/types";
import s from "./obra.module.scss";

const EMPTY = "__vacio";

export async function generateStaticParams() {
  const slugs = await listSlugs(COLLECTIONS.artworks);
  return (slugs.length ? slugs : [EMPTY]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/obra/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const w = slug === EMPTY ? null : await getArtwork(slug);
  if (!w) return { title: "Obra" };
  const c = w.collectionId ? await getCollection(w.collectionId) : null;
  const bits = [w.year ? String(w.year) : "", w.technique ?? "", w.dimensions ?? ""].filter(Boolean).join(", ");
  return {
    title: c ? `${w.title} · ${c.title}` : w.title,
    description: `«${w.title}», obra de Cali Rivera${bits ? ` (${bits})` : ""}${c ? `. Colección ${c.title}` : ""}.`,
    openGraph: { type: "article", images: w.images[0] ? [{ url: w.images[0].src, alt: w.images[0].alt || w.title }] : [] },
  };
}

const AVAILABILITY: Record<string, string> = {
  available: "Disponible", sold: "Vendida", "private-collection": "Colección privada", lost: "Perdida", unknown: "Paradero desconocido",
};

async function ObraContent({ params }: { params: PageProps<"/obra/[slug]">["params"] }) {
  const { slug } = await params;
  const w = slug === EMPTY ? null : await getArtwork(slug);
  if (!w) notFound();
  const c = w.collectionId ? await getCollection(w.collectionId) : null;
  const siblings = c ? await listArtworks(c.id) : [];
  const i = siblings.findIndex((x) => x.id === w.id);
  const prev = i > 0 ? siblings[i - 1] : null;
  const next = i >= 0 && i < siblings.length - 1 ? siblings[i + 1] : null;
  const path = `artworks/${w.id}`;
  const rows: [string, string, string][] = [
    ["Año", "year", w.year ? String(w.year) : ""],
    ["Técnica", "technique", w.technique ?? ""],
    ["Medidas", "dimensions", w.dimensions ?? ""],
    ["Estado", "availability", w.availability ? AVAILABILITY[w.availability] : ""],
  ];
  // Una obra puede tener varias fotos: frente y reverso de un estandarte, detalles.
  const faces = facesOf(w.images);
  const views = w.images.map((image, n) => (
    <ZoomView key={image.src} image={image} label={faces.length > 1 ? `${w.title}, ${faces[n].label.toLowerCase()}` : w.title}>
      <ArtImage image={image} path={`${path}#images.${n}`} priority={n === 0} sizes="(min-width: 60em) 62vw, 100vw" />
    </ZoomView>
  ));
  return (
    <GLReveal as="article" className={s.page} slot={1024}>
      <JsonLd data={artworkLd(w, c ?? null)} />
      <JsonLd data={breadcrumbLd([{ name: "Colecciones", path: "/colecciones" }, ...(c ? [{ name: c.title, path: `/colecciones/${c.slug}` }] : []), { name: w.title, path: `/obra/${w.slug}` }])} />
      <div className={s.media}>
        <ViewTransition name={`obra-${w.slug}`}>
          <div className={s.frame}>{views.length > 1 ? <Faces faces={faces}>{views}</Faces> : views[0]}</div>
        </ViewTransition>
      </div>
      <aside className={s.label}>
        {c && <Link href={`/colecciones/${c.slug}`} className={s.collection}>{c.title}{c.period ? `, ${c.period}` : ""}</Link>}
        <EditableText path={`${path}#title`} value={w.title} as="h1" className={s.title} />
        <dl className={s.sheet}>
          {rows.filter(([, , v]) => v).map(([k, f, v]) => (
            <div key={k} className={s.row}>
              <dt>{k}</dt>
              <EditableText path={`${path}#${f}`} value={v} as="dd" />
            </div>
          ))}
        </dl>
        {w.notes && <EditableText path={`${path}#notes`} value={w.notes} as="p" multiline className={s.notes} />}
        {siblings.length > 0 && (
          <nav className={s.pager} aria-label="Otras obras de la colección">
            {prev ? <Link href={`/obra/${prev.slug}`} rel="prev">Anterior</Link> : <span />}
            <span className={s.count}>{i + 1} de {siblings.length}</span>
            {next ? <Link href={`/obra/${next.slug}`} rel="next">Siguiente</Link> : <span />}
          </nav>
        )}
      </aside>
    </GLReveal>
  );
}

/**
 * `params` se lee dentro de <Suspense>: los slugs conocidos se prerenderizan igual
 * (generateStaticParams) y una navegación a un slug nuevo (recién creado en el CMS)
 * muestra el cascarón al instante en vez de bloquear.
 */
export default function Obra(props: PageProps<"/obra/[slug]">) {
  return (
    <Suspense fallback={<article className={s.page} aria-busy="true" />}>
      <ObraContent params={props.params} />
    </Suspense>
  );
}
