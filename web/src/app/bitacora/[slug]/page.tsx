import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EditableText } from "@/components/cms/editable";
import { SectionRenderer } from "@/components/layout-engine/SectionRenderer";
import { getPost, listSlugs } from "@/lib/content/repo";
import { COLLECTIONS } from "@/lib/content/types";
import { formatMonth, formatYear } from "@/lib/format";
import s from "./post.module.scss";

const EMPTY = "__vacio";

export async function generateStaticParams() {
  const slugs = await listSlugs(COLLECTIONS.posts);
  return (slugs.length ? slugs : [EMPTY]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/bitacora/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = slug === EMPTY ? null : await getPost(slug);
  return { title: p?.title ?? "Bitácora", description: p?.excerpt };
}

export default async function Post({ params }: PageProps<"/bitacora/[slug]">) {
  const { slug } = await params;
  const p = slug === EMPTY ? null : await getPost(slug);
  if (!p) notFound();
  const path = `posts/${p.id}`;
  const approx = p.tags?.includes("fecha-aproximada");
  return (
    <article className={s.page}>
      <header className={s.hero}>
        <Link href="/bitacora" className={s.back}>Bitácora</Link>
        <time dateTime={p.publishedAt} className={s.date}>{approx ? formatYear(p.publishedAt) : formatMonth(p.publishedAt)}</time>
        <EditableText path={`${path}#title`} value={p.title} as="h1" className={s.title} />
      </header>
      <SectionRenderer section={{ id: "cuerpo", layout: "auto", blocks: p.body }} base={`${path}#body`} />
      {p.sourceUrl && (
        <p className={s.source}>
          Rescatado del sitio original de calirivera.com. <a href={p.sourceUrl} target="_blank" rel="noopener">Ver la página archivada</a>.
        </p>
      )}
    </article>
  );
}
