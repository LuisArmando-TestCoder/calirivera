import type { Metadata } from "next";
import { BlockView } from "@/components/layout-engine/Blocks";
import { NarrationSlot } from "@/components/narration/NarrationSlot";
import { getPage } from "@/lib/content/repo";
import type { AnyBlock } from "@/lib/content/types";
import s from "./trayectoria.module.scss";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPage("trayectoria-and-entrevistas");
  return { title: "Trayectoria y entrevistas", description: p?.description };
}

/**
 * Trayectoria: un libro de registro. A la izquierda la línea de tiempo de exposiciones
 * (con el año fijo mientras se recorre); a la derecha, en columna estrecha, el currículum,
 * las entrevistas y la crítica.
 */
export default async function Trayectoria() {
  const page = await getPage("trayectoria-and-entrevistas");
  const sec = (id: string) => {
    const i = page?.sections.findIndex((x) => x.id === id) ?? -1;
    return i >= 0 && page
      ? { s: { ...page.sections[i], blocks: page.sections[i].blocks as AnyBlock[] }, base: `pages/trayectoria-and-entrevistas#sections.${i}.blocks` }
      : null;
  };
  const expo = sec("exposiciones");
  const side = ["curriculum", "entrevistas"].map(sec).filter(Boolean) as NonNullable<ReturnType<typeof sec>>[];
  const pv = sec("puntos-de-vista");
  const timelineBlock = expo?.s.blocks.findIndex((b) => b.type === "timeline") ?? -1;
  const years = expo && timelineBlock >= 0 && expo.s.blocks[timelineBlock].type === "timeline"
    ? (expo.s.blocks[timelineBlock] as { items: { year: string }[] }).items.map((x) => x.year) : [];
  return (
    <>
      <header className={s.hero}>
        <NarrationSlot beat="09" />
        <h1 className={s.title}>Trayectoria</h1>
        {years.length > 0 && (
          <p className={s.span} aria-label={`De ${years[years.length - 1]} a ${years[0]}`}>
            <span>{years[years.length - 1]}</span><span aria-hidden className={s.dash} /><span>{years[0]}</span>
          </p>
        )}
      </header>
      <div className={s.grid}>
        {expo && (
          <section className={s.main} aria-labelledby="tray-expo">
            <h2 id="tray-expo" className={s.h2}>{expo.s.title ?? "Exposiciones"}</h2>
            {expo.s.blocks.map((b, i) => (
              <BlockView key={b.id ?? i} block={b} base={expo.base} index={i} />
            ))}
          </section>
        )}
        <aside className={s.side}>
          {side.map((x) => (
            <section key={x.s.id} className={s.sideBlock}>
              {x.s.blocks.map((b, i) => <BlockView key={b.id ?? i} block={b} base={x.base} index={i} />)}
            </section>
          ))}
        </aside>
      </div>
      {pv && (
        <section className={s.pv}>
          {pv.s.blocks.map((b, i) => <BlockView key={b.id ?? i} block={b} base={pv.base} index={i} />)}
        </section>
      )}
    </>
  );
}
