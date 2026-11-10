import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProgramPage } from "@/components/program/ProgramPage";
import { getProgram, listPeople, listPosts } from "@/lib/content/repo";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getProgram("incubadora");
  return { title: p?.title ?? "Taller del Artista", description: p?.summary };
}

export default async function Page() {
  const [program, people, posts] = await Promise.all([getProgram("incubadora"), listPeople("incubadora"), listPosts("incubadora")]);
  if (!program) notFound();
  return <ProgramPage program={program} people={people} posts={posts} beat="21" variant="incubadora" />;
}
