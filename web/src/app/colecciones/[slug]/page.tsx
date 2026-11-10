import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Placeholder } from "@/components/Placeholder/Placeholder";
import { getCollection, listSlugs } from "@/lib/content/repo";
import { COLLECTIONS } from "@/lib/content/types";

/** Placeholder slug keeps the build valid while the collection is still empty. */
const EMPTY = "__vacio";

export async function generateStaticParams() {
  const slugs = await listSlugs(COLLECTIONS.collections);
  return (slugs.length ? slugs : [EMPTY]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/colecciones/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const doc = slug === EMPTY ? null : await getCollection(slug);
  return { title: doc?.title ?? "Colecciones" };
}

export default async function Page({ params }: PageProps<"/colecciones/[slug]">) {
  const { slug } = await params;
  const doc = slug === EMPTY ? null : await getCollection(slug);
  if (!doc) notFound();
  return <Placeholder eyebrow="Colecciones" title={doc.title} />;
}
