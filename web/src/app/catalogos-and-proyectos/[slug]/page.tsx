import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Placeholder } from "@/components/Placeholder/Placeholder";
import { getCatalog, listSlugs } from "@/lib/content/repo";
import { COLLECTIONS } from "@/lib/content/types";

/** Placeholder slug keeps the build valid while the collection is still empty. */
const EMPTY = "__vacio";

export async function generateStaticParams() {
  const slugs = await listSlugs(COLLECTIONS.catalogs);
  return (slugs.length ? slugs : [EMPTY]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/catalogos-and-proyectos/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const doc = slug === EMPTY ? null : await getCatalog(slug);
  return { title: doc?.title ?? "Catálogos & Proyectos" };
}

export default async function Page({ params }: PageProps<"/catalogos-and-proyectos/[slug]">) {
  const { slug } = await params;
  const doc = slug === EMPTY ? null : await getCatalog(slug);
  if (!doc) notFound();
  return <Placeholder eyebrow="Catálogos & Proyectos" title={doc.title} />;
}
