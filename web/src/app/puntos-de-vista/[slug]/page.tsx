import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { articleLd, breadcrumbLd } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditableText } from "@/components/cms/editable";
import { BlockView } from "@/components/layout-engine/Blocks";
import { SectionRenderer } from "@/components/layout-engine/SectionRenderer";
import { getPress, listPress, listSlugs } from "@/lib/content/repo";
import { COLLECTIONS, type Block } from "@/lib/content/types";
import s from "./nota.module.scss";

const EMPTY = "__vacio";

export async function generateStaticParams() {
  const slugs = await listSlugs(COLLECTIONS.press);
  return (slugs.length ? slugs : [EMPTY]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/puntos-de-vista/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const n = slug === EMPTY ? null : await getPress(slug);
  return n ? { title: `${n.title} · ${n.outlet}`, description: n.excerpt } : { title: "Prensa" };
}

/**
 * Una nota de prensa sobre Cali, rescatada del sitio viejo (Wayback Machine) como página propia:
 * se lee al instante, sin esperar al archivo. Cabecera de diario (medio, fecha, firma), cuerpo con el
 * motor de bloques, y al final de dónde salió y qué no se pudo recuperar.
 */
async function Nota({ params }: { params: PageProps<"/puntos-de-vista/[slug]">["params"] }) {
  const { slug } = await params;
  const n = slug === EMPTY ? null : await getPress(slug);
  if (!n) notFound();
  const all = await listPress();
  const i = all.findIndex((x) => x.id === n.id);
  const newer = i > 0 ? all[i - 1] : null;
  const older = i >= 0 && i < all.length - 1 ? all[i + 1] : null;
  const path = `press/${n.id}`;
  return (
    <article className={s.page}>
      <JsonLd data={articleLd(n, `/puntos-de-vista/${n.slug}`, { publisher: n.outlet, author: n.author })} />
      <JsonLd data={breadcrumbLd([{ name: "Puntos de vista", path: "/puntos-de-vista" }, { name: n.title, path: `/puntos-de-vista/${n.slug}` }])} />
      <header className={s.mast}>
        <nav className={s.crumbs} aria-label="Ruta">
          <Link href="/puntos-de-vista">Puntos de vista</Link>
        </nav>
        <p className={s.outlet}>
          <EditableText path={`${path}#outlet`} value={n.outlet} />
          <span aria-hidden className={s.rule} />
          <time dateTime={n.publishedAt}>{n.dateLabel ?? n.publishedAt.slice(0, 4)}</time>
        </p>
        <EditableText path={`${path}#title`} value={n.title} as="h1" className={s.title} />
        {n.author && <p className={s.byline}>Por {n.author}</p>}
      </header>
      <div className={s.body}>
        <SectionRenderer section={{ id: "nota", layout: "auto", blocks: n.body.filter((b): b is Block => b.type !== "links") }} base={`${path}#body`} />
        {n.body.map((b, i) => (b.type === "links" ? <div key={b.id} className={s.links}><BlockView block={b} base={`${path}#body`} index={i} /></div> : null))}
      </div>
      <footer className={s.foot}>
        <p className={s.source}>
          Rescatada del sitio original de calirivera.com, donde se publicó en «Puntos de vista».
          {n.missingImages ? ` ${n.missingImages === 1 ? "La foto que la acompañaba" : `Las ${n.missingImages} fotos que la acompañaban`} no quedó guardada en el archivo de internet.` : ""}
          {n.sourceUrl && (
            <>
              {" "}
              <a href={n.sourceUrl} target="_blank" rel="noopener">
                Ver la página archivada
              </a>
              .
            </>
          )}
        </p>
        <nav className={s.pager} aria-label="Otras notas">
          {older ? (
            <Link href={`/puntos-de-vista/${older.slug}`} className={s.prev}>
              <span>Anterior · {older.dateLabel ?? older.publishedAt.slice(0, 4)}</span>
              {older.title}
            </Link>
          ) : <span />}
          {newer && (
            <Link href={`/puntos-de-vista/${newer.slug}`} className={s.next}>
              <span>Siguiente · {newer.dateLabel ?? newer.publishedAt.slice(0, 4)}</span>
              {newer.title}
            </Link>
          )}
        </nav>
      </footer>
    </article>
  );
}

export default function NotaPage(props: PageProps<"/puntos-de-vista/[slug]">) {
  return (
    <Suspense fallback={<article className={s.page} aria-busy="true" />}>
      <Nota params={props.params} />
    </Suspense>
  );
}
