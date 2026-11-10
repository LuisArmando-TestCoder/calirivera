import type { Metadata } from "next";
import { SearchableList } from "@/components/list/SearchableList";
import { NarrationSlot } from "@/components/narration/NarrationSlot";
import { listPosts } from "@/lib/content/repo";
import { formatMonth, formatYear } from "@/lib/format";
import s from "./bitacora.module.scss";

export const metadata: Metadata = {
  title: "Bitácora",
  description: "Lo que pasa en el Taller del Artista: agendas, exposiciones, conciertos y talleres desde el año 2000.",
};

export default async function Bitacora() {
  const posts = await listPosts();
  const years = [...new Set(posts.map((p) => formatYear(p.publishedAt)))];
  return (
    <div className={s.page}>
      <header className={s.hero}>
        <NarrationSlot beat="23" />
        <h1 className={s.title}>Bitácora</h1>
        <p className={s.lead}>Lo que pasa en el Taller, de lo más reciente a lo más viejo.</p>
        {years.length > 1 && <p className={s.range} aria-hidden>{years[years.length - 1]}–{years[0]}</p>}
      </header>
      <div className={s.body}>
        <SearchableList
          label="la bitácora"
          empty="Todavía no hay entradas. Las nuevas aparecen aquí apenas se publican."
          items={posts.map((p) => ({
            id: p.id,
            href: `/bitacora/${p.slug}`,
            title: p.title,
            meta: p.tags?.includes("fecha-aproximada") ? formatYear(p.publishedAt) : formatMonth(p.publishedAt),
            excerpt: p.excerpt,
            keywords: p.tags?.join(" "),
          }))}
        />
      </div>
    </div>
  );
}
