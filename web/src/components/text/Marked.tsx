import { marksOf } from "@/lib/text/marks";
import s from "./marked.module.scss";

/** Texto con fechas, lugares y obras marcados. El texto visible es idéntico al original. */
export function Marked({ text }: { text: string }) {
  return (
    <>
      {marksOf(text).map((m, i) =>
        m.kind === "date" ? (
          <time key={i} className={s.date}>
            {m.value}
          </time>
        ) : m.kind === "place" ? (
          <span key={i} className={s.place}>
            {m.value}
          </span>
        ) : m.kind === "work" ? (
          <cite key={i} className={s.work}>
            {m.value}
          </cite>
        ) : (
          m.value
        ),
      )}
    </>
  );
}
