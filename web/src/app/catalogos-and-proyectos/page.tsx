import type { Metadata } from "next";
import Link from "next/link";
import { EditableList, EditableText } from "@/components/cms/editable";
import { SectionRenderer } from "@/components/layout-engine/SectionRenderer";
import { NarrationSlot } from "@/components/narration/NarrationSlot";
import { getPage, listCatalogs } from "@/lib/content/repo";
import s from "./catalogos.module.scss";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPage("catalogos-and-proyectos");
  return { title: "Catálogos y proyectos", description: p?.description };
}

export default async function Catalogos() {
  const [page, all] = await Promise.all([getPage("catalogos-and-proyectos"), listCatalogs()]);
  const catalogs = all.filter((c) => c.kind === "catalog");
  const projects = all.filter((c) => c.kind !== "catalog");
  const intro = page?.sections.find((x) => x.id === "intro");
  const resena = page?.sections.findIndex((x) => x.id === "resena") ?? -1;
  return (
    <>
      <header className={s.hero}>
        <h1 className={s.title}>Catálogos<br />y proyectos</h1>
        {intro?.blocks.map((b) => (b.type === "paragraph" ? <p key={b.id} className={s.lead}>{b.text}</p> : null))}
      </header>

      {/* Biblioteca: cada catálogo es un lomo; al tocarlo se abre el PDF */}
      <section className={s.shelfSection} aria-labelledby="cat-biblioteca">
        <h2 id="cat-biblioteca" className="visually-hidden">Catálogos digitales</h2>
        <EditableList path="catalogs" itemType="catalog" className={s.shelf}>
          {catalogs.map((c, i) => (
            <a
              key={c.id}
              href={c.fileUrl}
              target="_blank"
              rel="noopener"
              className={s.spine}
              style={{ "--h": 70 + ((i * 37) % 30), "--t": i % 4 } as React.CSSProperties}
            >
              <EditableText path={`catalogs/${c.id}#title`} value={c.title} className={s.spineTitle} />
              {c.year && <span className={s.spineYear}>{String(c.year)}</span>}
              <span className="visually-hidden">, abrir catálogo en PDF{c.summary ? ` (${c.summary})` : ""}</span>
            </a>
          ))}
        </EditableList>
        <div className={s.board} aria-hidden />
      </section>

      {projects.length > 0 && (
        <section className={s.projects} aria-labelledby="cat-proyectos">
          <NarrationSlot beat="18" />
          <h2 id="cat-proyectos" className={s.h2}>Archivo de proyectos</h2>
          <ul className={s.projectList}>
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/catalogos-and-proyectos/${p.slug}`} className={s.project}>
                  <span className={s.projectYear}>{p.year ? String(p.year) : ""}</span>
                  <EditableText path={`catalogs/${p.id}#title`} value={p.title} className={s.projectTitle} />
                  {p.summary && <span className={s.projectSummary}>{p.summary}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {resena >= 0 && page && (
        <SectionRenderer section={page.sections[resena]} base={`pages/catalogos-and-proyectos#sections.${resena}`} />
      )}
    </>
  );
}
