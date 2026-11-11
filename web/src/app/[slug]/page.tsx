import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditableList, EditableText } from "@/components/cms/editable";
import { BlockView } from "@/components/layout-engine/Blocks";
import { getPage, listPages } from "@/lib/content/repo";
import type { AnyBlock } from "@/lib/content/types";
import { ROUTES } from "@/lib/routes";
import s from "./pagina.module.scss";

const EMPTY = "__vacio";
// páginas que ya tienen su propia ruta diseñada (o que son piezas de otra): no se sirven acá
const OWN = new Set<string>([...ROUTES.map((r) => r.href.slice(1)), "inicio", "home", "puntos-de-vista"]);

export async function generateStaticParams() {
  const slugs = (await listPages()).map((p) => p.slug).filter((x) => !OWN.has(x));
  return (slugs.length ? slugs : [EMPTY]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = OWN.has(slug) || slug === EMPTY ? null : await getPage(slug);
  return p ? { title: p.seo?.title ?? p.title, description: p.seo?.description ?? p.description } : { title: "Página" };
}

/**
 * Página creada desde el editor («＋ Página nueva»): título, bajada y secciones de contenido libre.
 * Cada sección es una lista editable de bloques: con «＋ Agregar» Cali suma texto, fotos, galerías, citas,
 * poemas o un enlace de video, y los ordena con las flechas.
 */
async function Pagina({ params }: { params: PageProps<"/[slug]">["params"] }) {
  const { slug } = await params;
  const page = OWN.has(slug) || slug === EMPTY ? null : await getPage(slug);
  if (!page) notFound();
  const path = `pages/${page.id}`;
  return (
    <article className={s.page}>
      <header className={s.head}>
        <EditableText path={`${path}#title`} value={page.title} as="h1" className={s.title} />
        <EditableText path={`${path}#description`} value={page.description || " "} as="p" multiline className={s.lead} />
      </header>
      {page.sections.map((sec, i) => (
        <section key={sec.id} className={s.section} id={sec.id}>
          {sec.title && <EditableText path={`${path}#sections.${i}.title`} value={sec.title} as="h2" className={s.h2} />}
          <EditableList path={`${path}#sections.${i}.blocks`} itemType="block" className={s.flow}>
            {(sec.blocks as AnyBlock[]).map((b, k) => (
              <div key={b.id ?? k} className={`${s.block} ${b.type === "image" || b.type === "gallery" || b.type === "video" ? s.wide : ""}`}>
                <BlockView block={b} base={`${path}#sections.${i}.blocks`} index={k} marks />
              </div>
            ))}
          </EditableList>
        </section>
      ))}
    </article>
  );
}

export default function Page(props: PageProps<"/[slug]">) {
  return (
    <Suspense fallback={<article className={s.page} aria-busy="true" />}>
      <Pagina params={props.params} />
    </Suspense>
  );
}
