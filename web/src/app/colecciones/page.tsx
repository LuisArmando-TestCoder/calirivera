import type { Metadata } from "next";
import { CollectionBanner } from "@/components/art/CollectionBanner";
import { EditableList } from "@/components/cms/editable";
import { SectionRenderer } from "@/components/layout-engine/SectionRenderer";
import { NarrationSlot } from "@/components/narration/NarrationSlot";
import { getPage, listCollections } from "@/lib/content/repo";
import s from "./colecciones.module.scss";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPage("colecciones");
  return { title: "Colecciones", description: p?.description };
}

export default async function Colecciones() {
  const [page, collections] = await Promise.all([getPage("colecciones"), listCollections()]);
  return (
    <>
      <header className={s.hero}>
        <NarrationSlot beat="10" />
        <h1 className={s.title}>Colecciones</h1>
        <p className={s.count}>{collections.length} capítulos publicados</p>
      </header>
      {/* Tendedero: los estandartes cuelgan de una misma cuerda, cada uno a su altura */}
      <section className={s.line} aria-label="Colecciones">
        <div className={s.rope} aria-hidden />
        <EditableList path="collections" itemType="collection" className={s.grid}>
          {collections.map((c, i) => (
            <div key={c.id} className={s.item}>
              <CollectionBanner c={c} index={i} priority={i < 2} />
            </div>
          ))}
        </EditableList>
      </section>
      {page?.sections.map((sec, i) => (
        <SectionRenderer key={sec.id} section={sec} base={`pages/colecciones#sections.${i}`} index={i} />
      ))}
    </>
  );
}
