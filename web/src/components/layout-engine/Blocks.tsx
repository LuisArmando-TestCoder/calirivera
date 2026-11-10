import Link from "next/link";
import { EditableList, EditableText } from "@/components/cms/editable";
import { ArtImage } from "@/components/media/ArtImage";
import type { AnyBlock as Block, LinkItem, TimelineItem } from "@/lib/content/types";
import { LiteVideo } from "./LiteVideo";
import s from "./Blocks.module.scss";

type Ctx = { base: string; index: number; sizes?: string; reveal?: boolean };

/** Un bloque de contenido. `base` = ruta CMS de la lista de bloques, p. ej. "pages/biografia#sections.2.blocks". */
export function BlockView({ block, base, index, sizes, reveal = true }: { block: Block } & Ctx) {
  const p = `${base}.${index}`;
  switch (block.type) {
    case "heading": {
      const Tag = (`h${Math.min(4, Math.max(2, block.level))}`) as "h2" | "h3" | "h4";
      return (
        <EditableText
          path={`${p}.text`}
          value={block.text}
          as={Tag}
          className={`${s.heading} ${s[`h${block.level}`] ?? ""}`}
        />
      );
    }
    case "paragraph":
      return (
        <div data-reveal={reveal && block.lead ? "lines" : undefined}>
          <EditableText path={`${p}.text`} value={block.text} as="p" multiline className={block.lead ? s.lead : s.p} />
        </div>
      );
    case "quote":
      return (
        <figure className={s.quote}>
          <EditableText path={`${p}.text`} value={block.text} as="blockquote" multiline className={s.quoteText} />
          {block.cite && (
            <figcaption className={s.cite}>
              {block.href ? <a href={block.href}>{block.cite}</a> : <EditableText path={`${p}.cite`} value={block.cite} />}
            </figcaption>
          )}
        </figure>
      );
    case "poem":
      return (
        <figure className={s.poem}>
          {block.title && <EditableText path={`${p}.title`} value={block.title} as="h3" className={s.poemTitle} />}
          <div className={s.poemLines} data-reveal={reveal ? "lines" : undefined}>
            {block.lines.map((l, i) => (
              <EditableText key={i} path={`${p}.lines.${i}`} value={l} as="p" className={s.poemLine} />
            ))}
          </div>
          {block.author && <figcaption className={s.cite}>{block.author}</figcaption>}
        </figure>
      );
    case "image":
      return (
        <div className={s.image}>
          <ArtImage image={block.image} path={`${p}.image`} sizes={sizes} />
          {block.caption && <EditableText path={`${p}.caption`} value={block.caption} as="p" className={s.caption} />}
        </div>
      );
    case "gallery":
      return (
        <EditableList path={`${p}.images`} itemType="image" className={s.gallery}>
          {block.images.map((im, i) => (
            <ArtImage key={im.src + i} image={im} path={`${p}.images.${i}`} sizes="(min-width: 60em) 33vw, 50vw" />
          ))}
        </EditableList>
      );
    case "links":
      return <Links items={block.items} title={block.title} path={p} />;
    case "video":
      return <LiteVideo url={block.url} title={block.title} poster={block.poster} />;
    case "audio":
      return (
        <figure className={s.audio}>
          {block.title && <figcaption className={s.cite}>{block.title}</figcaption>}
          <audio controls preload="none" src={block.src} />
        </figure>
      );
    case "timeline":
      return <Timeline items={block.items} path={p} />;
  }
}

export function Links({ items, title, path }: { items: LinkItem[]; title?: string; path: string }) {
  return (
    <nav className={s.links} aria-label={title}>
      {title && <EditableText path={`${path}.title`} value={title} as="h3" className={s.linksTitle} />}
      <EditableList path={`${path}.items`} itemType="link" className={s.linkList}>
        {items.map((it, i) => {
          const ext = it.kind !== "internal";
          const inner = (
            <>
              <span className={s.linkLabel}>{it.label}</span>
              {it.note && <span className={s.linkNote}>{it.note}</span>}
            </>
          );
          return it.kind === "internal" ? (
            <Link key={i} href={it.href} className={s.link}>{inner}</Link>
          ) : (
            <a key={i} href={it.href} className={s.link} {...(ext ? { target: "_blank", rel: "noopener" } : {})}>
              {inner}
              <span className="visually-hidden"> (se abre en otra pestaña)</span>
            </a>
          );
        })}
      </EditableList>
    </nav>
  );
}

export function Timeline({ items, path }: { items: TimelineItem[]; path: string }) {
  // Cada obra/exposición es un hijo directo de la lista (contrato CMS); el año se muestra
  // solo en la primera entrada de cada año.
  return (
    <EditableList path={`${path}.items`} itemType="timeline" className={s.timeline}>
      {items.map((it, i) => {
        const first = i === 0 || items[i - 1].year !== it.year;
        return (
          <div key={i} className={`${s.tlItem} ${first ? s.tlFirst : ""}`}>
            <EditableText path={`${path}.items.${i}.year`} value={it.year} as="p" className={`${s.tlYearLabel} ${first ? "" : s.tlRepeat}`} />
            <div className={s.tlBody}>
              <EditableText path={`${path}.items.${i}.title`} value={it.title} as="p" className={s.tlTitle} />
              {it.detail && <EditableText path={`${path}.items.${i}.detail`} value={it.detail} as="p" className={s.tlDetail} />}
            </div>
          </div>
        );
      })}
    </EditableList>
  );
}
