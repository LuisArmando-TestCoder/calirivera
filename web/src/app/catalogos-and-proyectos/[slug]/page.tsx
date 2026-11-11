import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditableText } from "@/components/cms/editable";
import { SectionRenderer } from "@/components/layout-engine/SectionRenderer";
import { getCatalog, listSlugs } from "@/lib/content/repo";
import { COLLECTIONS } from "@/lib/content/types";
import s from "./proyecto.module.scss";

const EMPTY = "__vacio";

export async function generateStaticParams() {
  const slugs = await listSlugs(COLLECTIONS.catalogs);
  return (slugs.length ? slugs : [EMPTY]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/catalogos-and-proyectos/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const c = slug === EMPTY ? null : await getCatalog(slug);
  return { title: c?.title ?? "Catálogos y proyectos", description: c?.summary };
}

async function ProyectoContent({ params }: { params: PageProps<"/catalogos-and-proyectos/[slug]">["params"] }) {
  const { slug } = await params;
  const c = slug === EMPTY ? null : await getCatalog(slug);
  if (!c) notFound();
  const path = `catalogs/${c.id}`;
  return (
    <article className={s.page}>
      <header className={s.hero}>
        <Link href="/catalogos-and-proyectos" className={s.back}>Catálogos y proyectos</Link>
        {c.year && <p className={s.year}>{String(c.year)}</p>}
        <EditableText path={`${path}#title`} value={c.title} as="h1" className={s.title} />
        {c.summary && <EditableText path={`${path}#summary`} value={c.summary} as="p" className={s.summary} />}
        {c.fileUrl && <a className={s.file} href={c.fileUrl} target="_blank" rel="noopener">Abrir el catálogo (PDF)</a>}
      </header>
      {c.body.length > 0 && <SectionRenderer section={{ id: "texto", layout: "auto", blocks: c.body }} base={`${path}#body`} />}
    </article>
  );
}

/**
 * `params` se lee dentro de <Suspense>: los slugs conocidos se prerenderizan igual
 * (generateStaticParams) y una navegación a un slug nuevo (recién creado en el CMS)
 * muestra el cascarón al instante en vez de bloquear.
 */
export default function Proyecto(props: PageProps<"/catalogos-and-proyectos/[slug]">) {
  return (
    <Suspense fallback={<article className={s.page} aria-busy="true" />}>
      <ProyectoContent params={props.params} />
    </Suspense>
  );
}
