import { EditableText } from "@/components/cms/editable";
import { ArtImage } from "@/components/media/ArtImage";
import { NarrationSlot } from "@/components/narration/NarrationSlot";
import type { Section } from "@/lib/content/types";
import s from "./FireChapter.module.scss";

/**
 * Clímax de la biografía: 8 de noviembre de 2017.
 * Escena fijada de 4 pantallas de alto que lee --progress (0→1, MotionRoot [data-progress]):
 *  0.00–0.30  la fecha; el fondo pasa de añil a brasa
 *  0.30–0.65  el texto del incendio; brasas que suben
 *  0.65–1.00  el Ave Fénix: siete estandartes que se abren como alas; el fondo vuelve a ceniza
 * Sin JS o con movimiento reducido es una sección normal, todo legible.
 */
export function FireChapter({ section, base }: { section: Section; base: string }) {
  const blocksBase = `${base}.blocks`;
  const paras = section.blocks.map((b, i) => ({ b, i })).filter((x) => x.b.type === "paragraph");
  const imgs = section.blocks.map((b, i) => ({ b, i })).filter((x) => x.b.type === "image");
  const embers = Array.from({ length: 22 }, (_, i) => i);
  return (
    <section className={s.chapter} id={section.id} data-progress aria-labelledby="cenizas-title">
      <NarrationSlot beat="08" />
      <div className={s.stage}>
        <div className={s.backdrop} aria-hidden>
          {imgs.map(({ b, i }) =>
            b.type === "image" ? (
              <div key={i} className={s.photo} style={{ "--k": imgs.findIndex((x) => x.i === i) } as React.CSSProperties}>
                <ArtImage image={b.image} path={`${blocksBase}.${i}.image`} fit="cover" frame={false} sizes="100vw" />
              </div>
            ) : null,
          )}
        </div>
        <div className={s.embers} aria-hidden>
          {embers.map((i) => (
            <i key={i} style={{ "--e": i, "--sz": i % 4, "--dur": i % 5, "--dx": (i % 3) - 1 } as React.CSSProperties} />
          ))}
        </div>
        <div className={s.phoenix} aria-hidden>
          {Array.from({ length: 7 }, (_, i) => <span key={i} style={{ "--w": i - 3 } as React.CSSProperties} />)}
        </div>
        <div className={s.date} aria-hidden>
          <span>8 · XI</span>
          <span>2017</span>
        </div>
        <div className={s.text}>
          <h2 id="cenizas-title" className={s.title}>De las cenizas</h2>
          {paras.map(({ b, i }, k) =>
            b.type === "paragraph" ? (
              <EditableText
                key={i}
                path={`${blocksBase}.${i}.text`}
                value={b.text}
                as="p"
                multiline
                className={`${s.p} ${s[`p${k}`] ?? ""}`}
              />
            ) : null,
          )}
        </div>
      </div>
    </section>
  );
}
