import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProgramPage } from "@/components/program/ProgramPage";
import { getProgram, listPeople, listPosts } from "@/lib/content/repo";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getProgram("colaboracion");
  return { title: p?.title ?? "Taller del Artista", description: p?.summary };
}

export default async function Page() {
  const [program, people, posts] = await Promise.all([getProgram("colaboracion"), listPeople("colaboracion"), listPosts("colaboracion")]);
  if (!program) notFound();
  return <ProgramPage program={program} people={people} posts={posts} beat="20" variant="colaboracion" />;
}
