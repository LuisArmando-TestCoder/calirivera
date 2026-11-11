import type { MetadataRoute } from "next";
import { listArtworks, listCatalogs, listCollections, listMemories, listPages, listPosts, listPress } from "@/lib/content/repo";
import { ROUTES } from "@/lib/routes";
import { abs, SITE } from "@/lib/seo";

/** Todas las páginas públicas, con su fecha de último cambio y su imagen principal. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [pages, cols, works, posts, press, cats, mems] = await Promise.all([listPages(), listCollections(), listArtworks(), listPosts(), listPress(), listCatalogs(), listMemories()]);
  const own = new Set<string>([...ROUTES.map((r) => r.href.slice(1)), "inicio", "home"]);
  const d = (x?: string) => (x ? new Date(x) : undefined);
  const out: MetadataRoute.Sitemap = [
    ...ROUTES.map((r) => ({ url: `${SITE}${r.href === "/" ? "" : r.href}`, changeFrequency: "monthly" as const, priority: r.href === "/" ? 1 : 0.8, lastModified: d(pages.find((p) => `/${p.slug}` === r.href)?.updatedAt) })),
    ...pages.filter((p) => !own.has(p.slug)).map((p) => ({ url: `${SITE}/${p.slug}`, lastModified: d(p.updatedAt), priority: 0.6 })),
    ...cols.map((c) => ({ url: `${SITE}/colecciones/${c.slug}`, lastModified: d(c.updatedAt), priority: 0.9, images: c.cover ? [abs(c.cover.src)] : undefined })),
    ...works.map((w) => ({ url: `${SITE}/obra/${w.slug}`, lastModified: d(w.updatedAt), priority: 0.7, images: w.images[0] ? [abs(w.images[0].src)] : undefined })),
    ...cats.filter((c) => c.kind !== "catalog").map((c) => ({ url: `${SITE}/catalogos-and-proyectos/${c.slug}`, lastModified: d(c.updatedAt), priority: 0.6 })),
    ...posts.map((p) => ({ url: `${SITE}/bitacora/${p.slug}`, lastModified: d(p.updatedAt), priority: 0.5 })),
    ...press.map((p) => ({ url: `${SITE}/puntos-de-vista/${p.slug}`, lastModified: d(p.updatedAt), priority: 0.6 })),
    ...mems.map((m) => ({ url: `${SITE}/memoria/${m.slug}`, lastModified: d(m.updatedAt), priority: 0.3, images: [abs(m.image.src)] })),
  ];
  return out;
}
