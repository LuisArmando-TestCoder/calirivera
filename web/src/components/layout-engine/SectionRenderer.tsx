import { EditableText } from "@/components/cms/editable";
import { ArtImage } from "@/components/media/ArtImage";
import type { AnyBlock as Block, Section } from "@/lib/content/types";
import { BlockView } from "./Blocks";
import { chooseLayout, firstSentence, segment, textLength } from "./choose";
import s from "./Section.module.scss";
import { RevealLines } from "@/components/motion/RevealLines";

/**
 * Renderiza una Section con la diagramación que corresponde (motor procedural).
 * `base` = ruta CMS de la sección, p. ej. "pages/biografia#sections.3".
 */
export function SectionRenderer({ section, base, index = 0 }: { section: Section; base: string; index?: number }) {
  const layout = chooseLayout(section);
  const blocksBase = `${base}.blocks`;
  const tone = section.tone ? s[`tone-${section.tone}`] : "";
  const all = section.blocks as Block[];
  const withIdx = all.map((block, i) => ({ block, i }));
  const render = (list: { block: Block; i: number }[], sizes?: string) =>
    list.map(({ block, i }) => <BlockView key={block.id ?? i} block={block} base={blocksBase} index={i} sizes={sizes} />);
  const heading = withIdx.find((x) => x.block.type === "heading");
  const title = section.title ? (
    <EditableText path={`${base}.title`} value={section.title} as="h2" className={s.sectionTitle} />
  ) : null;

  switch (layout) {
    case "kinetic-statement": {
      return (
        <section className={`${s.section} ${s.kinetic} ${tone}`} id={section.id}>
          <div className={s.wrap}>
            {title}
            {withIdx.map(({ block, i }) =>
              block.type === "paragraph" ? (
                <RevealLines key={i}>
                  <EditableText path={`${blocksBase}.${i}.text`} value={block.text} as="p" multiline className={s.statement} />
                </RevealLines>
              ) : (
                <BlockView key={i} block={block} base={blocksBase} index={i} />
              ),
            )}
          </div>
        </section>
      );
    }
    case "poem-center":
      return (
        <section className={`${s.section} ${s.poemCenter} ${tone}`} id={section.id}>
          <div className={s.narrow}>{title}{render(withIdx)}</div>
        </section>
      );
    case "fullbleed-image": {
      const imgIdx = withIdx.find((x) => x.block.type === "image");
      const rest = withIdx.filter((x) => x !== imgIdx);
      return (
        <section className={`${s.section} ${s.fullbleed} ${tone}`} id={section.id}>
          {imgIdx && imgIdx.block.type === "image" && (
            <div className={s.bleedMedia}>
              <div className={s.bleedInner} data-parallax="0.12">
                <ArtImage image={imgIdx.block.image} path={`${blocksBase}.${imgIdx.i}.image`} sizes="100vw" fit="cover" frame={false} />
              </div>
            </div>
          )}
          <div className={s.bleedCard}>{title}{render(rest)}</div>
        </section>
      );
    }
    case "split-sticky": {
      const media = withIdx.filter((x) => x.block.type === "image" || x.block.type === "gallery");
      const text = withIdx.filter((x) => !media.includes(x));
      const flip = index % 2 === 1;
      return (
        <section className={`${s.section} ${s.split} ${flip ? s.flip : ""} ${tone}`} id={section.id}>
          <div className={s.splitMedia}>
            <div className={s.sticky}>{render(media, "(min-width: 60em) 42vw, 100vw")}</div>
          </div>
          <div className={s.splitText}>{title}{renderSegmented(text, blocksBase)}</div>
        </section>
      );
    }
    case "horizontal-track": {
      const head = withIdx.filter((x) => x.block.type === "heading" || x.block.type === "paragraph");
      const items = withIdx.filter((x) => !head.includes(x));
      const cells = items.flatMap(({ block, i }) =>
        block.type === "gallery"
          ? block.images.map((im, j) => (
              <div key={`${i}-${j}`} className={s.trackCell}>
                <ArtImage image={im} path={`${blocksBase}.${i}.images.${j}`} sizes="(min-width: 60em) 36vw, 80vw" />
              </div>
            ))
          : [<div key={i} className={`${s.trackCell} ${block.type === "video" ? s.trackWide : ""}`}><BlockView block={block} base={blocksBase} index={i} /></div>],
      );
      return (
        <section className={`${s.section} ${s.trackSection} ${tone}`} id={section.id} data-pin-track>
          <div data-pin-frame>
            <div className={s.trackHead}>{title}{render(head)}</div>
            <div className={s.trackViewport}>
              <div className={s.track} data-track>{cells}</div>
            </div>
          </div>
        </section>
      );
    }
    case "gallery-masonry": {
      const gal = withIdx.filter((x) => x.block.type === "gallery");
      const rest = withIdx.filter((x) => !gal.includes(x));
      return (
        <section className={`${s.section} ${s.masonry} ${tone}`} id={section.id}>
          <div className={s.wrap}>
            <div className={s.masonryHead}>{title}{render(rest)}</div>
            {render(gal)}
          </div>
        </section>
      );
    }
    case "editorial-columns":
    default: {
      const long = textLength(all) > 900;
      return (
        <section className={`${s.section} ${s.editorial} ${long ? s.long : ""} ${tone}`} id={section.id}>
          <div className={s.wrap}>
            {heading && <div className={s.editorialHead}>{title}<BlockView block={heading.block} base={blocksBase} index={heading.i} /></div>}
            {!heading && title && <div className={s.editorialHead}>{title}</div>}
            <div className={`${s.editorialBody} ${!heading && !title ? s.noHead : ""}`}>{renderSegmented(withIdx.filter((x) => x !== heading), blocksBase)}</div>
          </div>
        </section>
      );
    }
  }
}

/** Texto largo → pliegos con cita destacada (de la primera frase del pliego). */
function renderSegmented(list: { block: Block; i: number }[], base: string) {
  const blocks = list.map((x) => x.block);
  const groups = segment(blocks);
  if (groups.length < 2) return list.map(({ block, i }) => <BlockView key={i} block={block} base={base} index={i} />);
  let k = 0;
  return groups.map((g, gi) => {
    const items = g.map(() => list[k++]);
    const firstP = g.find((b) => b.type === "paragraph");
    const pull = gi > 0 && firstP && firstP.type === "paragraph" ? firstSentence(firstP.text) : null;
    return (
      <div key={gi} className={s.fold}>
        {pull && <p className={s.pull} aria-hidden>{pull}</p>}
        {items.map(({ block, i }) => <BlockView key={i} block={block} base={base} index={i} />)}
      </div>
    );
  });
}
