import Link from "next/link";
import { EditableList, EditableText } from "@/components/cms/editable";
import { BlockView } from "@/components/layout-engine/Blocks";
import { NarrationSlot } from "@/components/narration/NarrationSlot";
import { SearchableList } from "@/components/list/SearchableList";
import { ArtImage } from "@/components/media/ArtImage";
import type { Person, Post, Program } from "@/lib/content/types";
import { formatMonth } from "@/lib/format";
import s from "./ProgramPage.module.scss";
import { RevealLines } from "@/components/motion/RevealLines";

/**
 * Página de programa del Taller. Cada programa tiene su propio tono y forma:
 *  - colaboración: ocre; un registro de nombres (quién pasó por el Taller y qué logró)
 *  - incubadora: papel; centrada como una página de libro, con poemas
 *  - jóvenes talentos: azul; ritmo de cartel
 */
export function ProgramPage({ program, people, posts, beat, variant }: {
  program: Program; people: Person[]; posts: Post[]; beat: string; variant: "colaboracion" | "incubadora" | "jovenes";
}) {
  const path = `programs/${program.id}`;
  return (
    <article className={`${s.page} ${s[variant]}`}>
      <NarrationSlot beat={beat} />
      <header className={s.hero}>
        {program.schedule && <p className={s.day}>{program.schedule}</p>}
        <EditableText path={`${path}#title`} value={program.title} as="h1" className={s.title} />
        {program.summary && (
          <RevealLines>
            <EditableText path={`${path}#summary`} value={program.summary} as="p" multiline className={s.summary} />
          </RevealLines>
        )}
      </header>

      {program.body.length > 0 && (
        <section className={s.body}>
          {program.body.map((b, i) => <BlockView key={b.id ?? i} block={b} base={`${path}#body`} index={i} />)}
        </section>
      )}

      <section className={s.people} aria-labelledby={`${variant}-personas`}>
        <h2 id={`${variant}-personas`} className={s.h2}>
          {variant === "incubadora" ? "Autores" : variant === "jovenes" ? "Quiénes han tocado" : "Artistas acompañados"}
        </h2>
        {people.length ? (
          <EditableList path="people" itemType="person" className={s.peopleGrid}>
            {people.map((p) => (
              <figure key={p.id} className={s.person}>
                {p.portrait && <ArtImage image={p.portrait} path={`people/${p.id}#portrait`} sizes="(min-width: 60em) 25vw, 50vw" fit="cover" />}
                <figcaption>
                  <EditableText path={`people/${p.id}#name`} value={p.name} as="p" className={s.personName} />
                  {p.discipline && <EditableText path={`people/${p.id}#discipline`} value={p.discipline} as="p" className={s.personMeta} />}
                  {p.bio && <EditableText path={`people/${p.id}#bio`} value={p.bio} as="p" multiline className={s.personBio} />}
                </figcaption>
                {p.featured?.map((b, i) => <BlockView key={i} block={b} base={`people/${p.id}#featured`} index={i} />)}
              </figure>
            ))}
          </EditableList>
        ) : (
          <div className={s.empty}>
            <p>Esta lista se está armando. Cada {variant === "incubadora" ? "autor" : "artista"} que pase por el Taller va a aparecer aquí, con su nombre y su obra.</p>
            <EditableList path="people" itemType="person" className={s.peopleGrid}>{null}</EditableList>
          </div>
        )}
      </section>

      {posts.length > 0 && (
        <section className={s.posts}>
          <h2 className={s.h2}>En la bitácora</h2>
          <SearchableList
            label={program.title}
            empty=""
            pageSize={8}
            items={posts.map((p) => ({ id: p.id, href: `/bitacora/${p.slug}`, title: p.title, meta: formatMonth(p.publishedAt), excerpt: p.excerpt }))}
          />
        </section>
      )}

      <nav className={s.back}><Link href="/taller-del-artista">Volver al Taller del Artista</Link></nav>
    </article>
  );
}
