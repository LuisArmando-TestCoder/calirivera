import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FireChapter } from "@/components/bio/FireChapter";
import { SectionRenderer } from "@/components/layout-engine/SectionRenderer";
import { NarrationSlot } from "@/components/narration/NarrationSlot";
import { EditableText } from "@/components/cms/editable";
import { getPage } from "@/lib/content/repo";
import s from "./bio.module.scss";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPage("biografia");
  return { title: "Biografía", description: p?.description };
}

/** Año de cada capítulo (tomado del propio texto de la biografía) y beat del guión de voz. */
const CHAPTERS: Record<string, { year: string; beat: string }> = {
  quien: { year: "1969", beat: "02" },
  "una-vocacion-que-comenzo-en-la-infancia": { year: "1994", beat: "03" },
  "de-la-pintura-a-un-universo-multidisciplinario": { year: "Años 90", beat: "04" },
  "un-espacio-para-vivir-el-arte": { year: "2000", beat: "05" },
  "crear-tambien-es-tomar-posicion": { year: "2009", beat: "06" },
  "una-obra-que-traspasa-fronteras": { year: "2014", beat: "07" },
};

export default async function Biografia() {
  const page = await getPage("biografia");
  if (!page) notFound();
  const [first, ...rest] = (page.hero?.title ?? "Cali Rivera").split(" ");
  return (
    <article className={s.page}>
      <div className={s.thread} aria-hidden />
      <header className={s.hero}>
        <h1 className={s.name}>
          <span className={s.n1}>{first}</span>
          <span className={s.n2}>{rest.join(" ")}</span>
        </h1>
        {page.hero?.subtitle && (
          <EditableText path="pages/biografia#hero.subtitle" value={page.hero.subtitle} as="p" className={s.sub} />
        )}
      </header>

      {page.sections.map((sec, i) => {
        const base = `pages/biografia#sections.${i}`;
        if (sec.id === "de-las-cenizas") return <FireChapter key={sec.id} section={sec} base={base} />;
        const ch = CHAPTERS[sec.id];
        return (
          <div key={sec.id} className={s.chapter}>
            {ch && (
              <>
                <NarrationSlot beat={ch.beat} />
                <p className={s.year} aria-hidden>{ch.year}</p>
              </>
            )}
            <SectionRenderer section={sec} base={base} index={i} />
          </div>
        );
      })}

      <nav className={s.next} aria-label="Seguir leyendo">
        <Link href="/trayectoria-and-entrevistas">Exposiciones, prensa y currículum</Link>
        <Link href="/colecciones">Las colecciones</Link>
      </nav>
    </article>
  );
}
