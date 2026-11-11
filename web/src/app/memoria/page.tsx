import type { Metadata } from "next";
import Link from "next/link";
import { EditableList } from "@/components/cms/editable";
import { MemoryCard } from "@/components/memoria/MemoryCard";
import { MemoriaField } from "@/components/memoria/MemoriaField";
import { NarrationSlot } from "@/components/narration/NarrationSlot";
import { listCollections, listMemories } from "@/lib/content/repo";
import { KIND_LABEL, layoutMemories } from "@/lib/memoria/layout";
import s from "@/components/memoria/memoria.module.scss";

export const metadata: Metadata = {
  title: "Memoria del Taller",
  description:
    "Las fotos de siempre: obras, exposiciones, el Taller del Artista y su gente, año por año desde 1993. Rescatadas del sitio original de calirivera.com.",
};

export default async function Memoria() {
  const [memories, collections] = await Promise.all([listMemories(), listCollections()]);
  const years = layoutMemories(memories);
  const dated = years.filter((y) => y.year !== null);
  const first = dated[0]?.year;
  const last = dated.at(-1)?.year;
  const kinds = Object.entries(KIND_LABEL).filter(([k]) => memories.some((m) => m.kind === k));
  const cols = collections.filter((c) => memories.some((m) => m.collectionId === c.id));
  let n = 0;

  return (
    <div className={s.page}>
      <header className={s.hero}>
        <NarrationSlot beat="25" />
        <p className={s.kicker}>Taller del Artista · archivo visual</p>
        <h1 className={s.title} aria-label="Memoria">
          <span aria-hidden className={s.titleWord}>
            {"Memoria".split("").map((ch, i) => (
              <span key={i} style={{ "--i": i } as React.CSSProperties}>
                {ch}
              </span>
            ))}
          </span>
        </h1>
        <p className={s.lead}>
          {words(
            `${memories.length} fotos rescatadas del sitio de siempre${first && last ? `, de ${first} a ${last}` : ""}. Como el Taller después del incendio de 2017, cada una vuelve de la ceniza al llegar.`,
          )}
        </p>
        <p className={s.hint}>
          Bajá (o arrastrá de lado) para recorrer los años · <kbd>←</kbd> <kbd>→</kbd> entre fotos · <kbd>Enter</kbd> para abrir · <kbd>+</kbd> <kbd>−</kbd> abajo para acercar o alejar
        </p>
      </header>

      <MemoriaField
        total={memories.length}
        kinds={kinds.map(([value, label]) => ({ value, label }))}
        collections={cols.map((c) => ({ value: c.id, label: c.title }))}
        years={years.map((y) => ({ key: y.key, label: y.label, count: y.items.length }))}
      >
        <div className={s.years}>
          {years.map((y) => (
            <section
              key={y.key}
              id={`y${y.key}`}
              className={s.year}
              data-year-block={y.key}
              aria-labelledby={`yh${y.key}`}
            >
              <span className={s.ghost} aria-hidden data-ghost>
                {y.year !== null ? y.label : "s/f"}
              </span>
              <h2 id={`yh${y.key}`} className={s.yearHead}>
                <span className={s.yearNum}>{y.label}</span>
                <span className={s.yearCount}>
                  {y.items.length} {y.items.length === 1 ? "foto" : "fotos"}
                  {y.approx && y.year !== null ? " · año aproximado" : ""}
                </span>
              </h2>
              <EditableList path="memories" itemType="memory" className={s.loom}>
                {y.items.map((p) => (
                  <MemoryCard key={p.memory.id} p={p} index={++n} priority={n <= 3} />
                ))}
              </EditableList>
            </section>
          ))}
        </div>
      </MemoriaField>

      <footer className={s.outro}>
        <p>
          ¿Tenés una foto del Taller que no está acá? Escribile a Cali a <a href="mailto:arte@calirivera.com">arte@calirivera.com</a>.
        </p>
        <p>
          <Link href="/bitacora">Ver la Bitácora</Link> · <Link href="/colecciones">Ver las colecciones</Link>
        </p>
      </footer>
    </div>
  );
}

/** Cada palabra en su span (se enfocan una a una); el texto sigue siendo uno solo para lectores de pantalla. */
function words(text: string) {
  return text.split(/(\s+)/).map((w, i) =>
    /^\s+$/.test(w) ? w : (
      <span key={i} className={s.word} style={{ "--w": i / 2 } as React.CSSProperties}>
        {w}
      </span>
    ),
  );
}
