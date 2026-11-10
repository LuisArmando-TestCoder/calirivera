import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Placeholder } from "@/components/Placeholder/Placeholder";
import { getPost, listSlugs } from "@/lib/content/repo";
import { COLLECTIONS } from "@/lib/content/types";

/** Placeholder slug keeps the build valid while the collection is still empty. */
const EMPTY = "__vacio";

export async function generateStaticParams() {
  const slugs = await listSlugs(COLLECTIONS.posts);
  return (slugs.length ? slugs : [EMPTY]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/bitacora/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const doc = slug === EMPTY ? null : await getPost(slug);
  return { title: doc?.title ?? "Bitácora" };
}

export default async function Page({ params }: PageProps<"/bitacora/[slug]">) {
  const { slug } = await params;
  const doc = slug === EMPTY ? null : await getPost(slug);
  if (!doc) notFound();
  return <Placeholder eyebrow="Bitácora" title={doc.title} />;
}
