import type { AnyBlock as Block, LayoutPreset, Section } from "@/lib/content/types";

/** Largo total del texto corrido de una lista de bloques. */
export function textLength(blocks: Block[]): number {
  return blocks.reduce((n, b) => n + (b.type === "paragraph" || b.type === "quote" ? b.text.length : 0), 0);
}

/**
 * Motor procedural: elige la diagramación de una sección según su contenido.
 * Reglas (en orden):
 *  - poema → poem-center
 *  - galería grande (≥ 6) → horizontal-track si son apaisadas, si no gallery-masonry
 *  - videos → horizontal-track
 *  - una frase corta (< 220 caracteres) sin imágenes → kinetic-statement
 *  - imagen + texto largo (> 450) o varias imágenes → split-sticky; una imagen + texto corto → fullbleed-image
 *    (salvo que la imagen sea de baja resolución: entonces split-sticky, que la muestra chica)
 *  - texto largo → editorial-columns
 */
export function chooseLayout(section: Section): Exclude<LayoutPreset, "auto"> {
  if (section.layout && section.layout !== "auto") return section.layout;
  const b = section.blocks as Block[];
  const has = (t: Block["type"]) => b.some((x) => x.type === t);
  const images = b.flatMap((x) => (x.type === "image" ? [x.image] : x.type === "gallery" ? x.images : []));
  const len = textLength(b);

  if (has("poem")) return "poem-center";
  const gallery = b.find((x) => x.type === "gallery");
  if (gallery && gallery.type === "gallery" && gallery.images.length >= 6) {
    const landscape = gallery.images.filter((i) => (i.width ?? 1) > (i.height ?? 1)).length;
    return landscape > gallery.images.length / 2 ? "horizontal-track" : "gallery-masonry";
  }
  if (b.filter((x) => x.type === "video").length > 1) return "horizontal-track";
  if (!images.length && len > 0 && len < 220 && !has("links") && !has("timeline")) return "kinetic-statement";
  if (images.length) {
    if (len > 450 || images.length > 1 || images.some((i) => i.lowRes)) return "split-sticky";
    return "fullbleed-image";
  }
  return "editorial-columns";
}

/**
 * Diagramación reactiva de texto largo: agrupa párrafos en «pliegos» de ~1200 caracteres.
 * Cada pliego después del primero abre con una cita destacada tomada de su propia primera
 * frase (no se inventa texto; la cita es decorativa y se oculta a lectores de pantalla).
 */
export function segment(blocks: Block[], target = 1200): Block[][] {
  const out: Block[][] = [];
  let cur: Block[] = [];
  let n = 0;
  for (const b of blocks) {
    const l = b.type === "paragraph" ? b.text.length : 200;
    if (b.type === "heading" && cur.length) { out.push(cur); cur = []; n = 0; }
    cur.push(b);
    n += l;
    if (n >= target && b.type === "paragraph") { out.push(cur); cur = []; n = 0; }
  }
  if (cur.length) out.push(cur);
  return out;
}

export function firstSentence(t: string, max = 160): string | null {
  const m = t.match(/^(.{40,}?[.!?])(\s|$)/);
  const s = m ? m[1] : null;
  return s && s.length <= max ? s : null;
}
