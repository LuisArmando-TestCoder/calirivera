import { EditableText } from "@/components/cms/editable";
import type { AnyBlock as Block } from "@/lib/content/types";
import { anchorOf, factsOf } from "@/lib/text/marks";
import { BlockView } from "./Blocks";
import s from "./Chronicle.module.scss";

/**
 * Crónica: un relato largo partido en etapas, pensado para el diagrama de Gutenberg.
 * Cada párrafo es una fila: arriba a la izquierda (zona óptica primaria) el año que la ancla;
 * al centro el texto con fechas, lugares y obras marcados; abajo a la derecha (zona terminal)
 * los lugares y obras que nombra, para que quien hojea se lleve lo esencial.
 * Si un párrafo no trae año, hereda el anterior en gris: la línea de tiempo nunca se corta.
 */
export function Chronicle({ items, base }: { items: { block: Block; i: number }[]; base: string }) {
  // año de cada fila (propio o heredado), calculado antes de pintar
  const anchors = items.reduce<{ anchor: string | null; fresh: boolean }[]>((acc, { block }) => {
    const prev = acc.length ? acc[acc.length - 1].anchor : null;
    const own = block.type === "paragraph" || block.type === "quote" ? anchorOf(block.text) : null;
    acc.push({ anchor: own ?? prev, fresh: own !== null && own !== prev });
    return acc;
  }, []);
  return (
    <ol className={s.chronicle}>
      {items.map(({ block, i }, k) => {
        if (block.type === "heading") {
          return (
            <li key={i} className={s.divider}>
              <EditableText path={`${base}.${i}.text`} value={block.text} as="h3" className={s.dividerText} />
            </li>
          );
        }
        if (block.type !== "paragraph" && block.type !== "quote") {
          return (
            <li key={i} className={s.wide}>
              <BlockView block={block} base={base} index={i} marks />
            </li>
          );
        }
        const { anchor, fresh } = anchors[k];
        const { places, works } = factsOf(block.text);
        const lead = block.type === "paragraph" && block.lead;
        return (
          <li key={i} className={`${s.row} ${lead ? s.lead : ""}`} data-reveal="up">
            <p className={`${s.anchor} ${fresh ? "" : s.carried}`} aria-hidden={!fresh}>
              {anchor ?? ""}
            </p>
            <div className={s.body}>
              {block.type === "quote" ? (
                <BlockView block={block} base={base} index={i} marks />
              ) : (
                <EditableText path={`${base}.${i}.text`} value={block.text} as="p" multiline marks className={s.text} />
              )}
            </div>
            {(places.length > 0 || works.length > 0) && (
              <dl className={s.facts}>
                {places.length > 0 && (
                  <div>
                    <dt>Lugares</dt>
                    <dd>{places.join(" · ")}</dd>
                  </div>
                )}
                {works.length > 0 && (
                  <div>
                    <dt>Obras</dt>
                    <dd>
                      {works.map((w, k) => (
                        <cite key={k}>
                          {k > 0 ? " · " : ""}
                          {w}
                        </cite>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </li>
        );
      })}
    </ol>
  );
}
