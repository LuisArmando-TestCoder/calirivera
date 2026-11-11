import { getPage, getSettings, listArtworks, listCatalogs, listCollections, listMemories, listPosts, listPress } from "@/lib/content/repo";
import type { AnyBlock } from "@/lib/content/types";
import { SITE } from "@/lib/seo";

/**
 * /llms.txt — el sitio contado en texto plano para asistentes de IA (ChatGPT, Claude, Perplexity…):
 * quién es Cali Rivera, qué hay en cada sección y dónde, con enlaces. Se arma solo con el contenido publicado.
 */
const text = (blocks: AnyBlock[]) =>
  blocks
    .map((b) => (b.type === "paragraph" || b.type === "quote" ? b.text : b.type === "heading" ? `\n### ${b.text}` : b.type === "poem" ? b.lines.join("\n") : ""))
    .filter(Boolean)
    .join("\n\n");

export async function GET() {
  const [s, bio, man, taller, cols, works, posts, press, cats, mems] = await Promise.all([
    getSettings(),
    getPage("biografia"),
    getPage("manifiesto"),
    getPage("taller-del-artista"),
    listCollections(),
    listArtworks(),
    listPosts(),
    listPress(),
    listCatalogs(),
    listMemories(),
  ]);
  const sec = (p: typeof bio) => (p ? p.sections.map((x) => text(x.blocks as AnyBlock[])).join("\n\n") : "");
  const years = mems.map((m) => Number(m.year)).filter((y) => y > 1900);
  const lines = [
    `# Cali Rivera`,
    ``,
    `> ${s.tagline} Sitio oficial del artista multidisciplinario costarricense Cali Rivera: su obra (pintura, arte textil, instalación), sus colecciones y catálogos, su trayectoria, y el Taller del Artista que fundó en Tres Ríos, Costa Rica.`,
    ``,
    `- Sitio: ${SITE}`,
    `- Contacto: ${s.email}${s.whatsapp ? ` · WhatsApp ${s.whatsapp}` : ""}`,
    s.address ? `- Taller del Artista: ${s.address}` : null,
    ...s.social.map((x) => `- ${x.label}: ${x.href}`),
    `- Idioma: español (Costa Rica). Se puede citar y enlazar; las imágenes de obra pertenecen al artista.`,
    ``,
    `## Secciones`,
    `- [Biografía](${SITE}/biografia): quién es Cali Rivera, formación y etapas.`,
    `- [Colecciones](${SITE}/colecciones): ${cols.length} colecciones, ${works.length} obras con ficha.`,
    `- [Catálogos y proyectos](${SITE}/catalogos-and-proyectos): ${cats.length} catálogos y proyectos, varios en PDF.`,
    `- [Trayectoria y entrevistas](${SITE}/trayectoria-and-entrevistas): exposiciones, currículum, entrevistas.`,
    `- [Puntos de vista](${SITE}/puntos-de-vista): ${press.length} notas de crítica y prensa.`,
    `- [Manifiesto](${SITE}/manifiesto): su visión del arte, en primera persona.`,
    `- [Taller del Artista](${SITE}/taller-del-artista): el espacio cultural en Tres Ríos.`,
    `- [Bitácora](${SITE}/bitacora): ${posts.length} entradas con la agenda y la historia del Taller.`,
    `- [Memoria del Taller](${SITE}/memoria): ${mems.length} fotos${years.length ? `, de ${Math.min(...years)} a ${Math.max(...years)}` : ""}.`,
    ``,
    `## Colecciones`,
    ...cols.map((c) => `- [${c.title}](${SITE}/colecciones/${c.slug})${c.period ? ` (${c.period})` : ""}${c.technique ? `. ${c.technique}` : ""}${c.statement ? `. ${c.statement.replace(/\s+/g, " ").slice(0, 240)}` : ""}`),
    ``,
    `## Obras`,
    ...works.map((w) => `- [${w.title}](${SITE}/obra/${w.slug})${w.year ? `, ${w.year}` : ""}${w.technique ? `, ${w.technique}` : ""}${w.dimensions ? `, ${w.dimensions}` : ""}`),
    ``,
    `## Crítica y prensa`,
    ...press.map((p) => `- [${p.title}](${SITE}/puntos-de-vista/${p.slug}). ${p.outlet}${p.dateLabel ? `, ${p.dateLabel}` : ""}${p.author ? `. Por ${p.author}` : ""}`),
    ``,
    `## Biografía`,
    sec(bio),
    ``,
    `## Manifiesto`,
    sec(man),
    ``,
    `## Taller del Artista`,
    sec(taller),
  ];
  return new Response(lines.filter((l) => l !== null).join("\n").replace(/\n{3,}/g, "\n\n") + "\n", {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
