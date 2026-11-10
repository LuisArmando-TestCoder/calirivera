import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectionRenderer } from "@/components/layout-engine/SectionRenderer";
import { NarrationSlot } from "@/components/narration/NarrationSlot";
import { getPage } from "@/lib/content/repo";
import s from "./manifiesto.module.scss";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPage("manifiesto");
  return { title: "Manifiesto", description: p?.description };
}

/** El lema se arma palabra por palabra, cada una con un ancho distinto de la misma fuente. */
export default async function Manifiesto() {
  const page = await getPage("manifiesto");
  if (!page) notFound();
  const words = (page.hero?.title ?? "El arte es para ser libres.").split(" ");
  return (
    <article className={s.page}>
      <NarrationSlot beat="24" />
      <h1 className={s.motto} aria-label={page.hero?.title}>
        {words.map((w, i) => (
          <span key={i} aria-hidden className={s.word} style={{ "--i": i, "--w": [140, 60, 100, 52, 120, 75][i % 6] } as React.CSSProperties}>{w}</span>
        ))}
      </h1>
      {page.sections.map((sec, i) => (
        <SectionRenderer key={sec.id} section={sec} base={`pages/manifiesto#sections.${i}`} index={i} />
      ))}
    </article>
  );
}
