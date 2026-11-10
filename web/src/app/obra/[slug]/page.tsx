import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Placeholder } from "@/components/Placeholder/Placeholder";
import { getArtwork, listSlugs } from "@/lib/content/repo";
import { COLLECTIONS } from "@/lib/content/types";

/** Placeholder slug keeps the build valid while the collection is still empty. */
const EMPTY = "__vacio";

export async function generateStaticParams() {
  const slugs = await listSlugs(COLLECTIONS.artworks);
  return (slugs.length ? slugs : [EMPTY]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/obra/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const doc = slug === EMPTY ? null : await getArtwork(slug);
  return { title: doc?.title ?? "Obra" };
}

export default async function Page({ params }: PageProps<"/obra/[slug]">) {
  const { slug } = await params;
  const doc = slug === EMPTY ? null : await getArtwork(slug);
  if (!doc) notFound();
  return <Placeholder eyebrow="Obra" title={doc.title} />;
}
