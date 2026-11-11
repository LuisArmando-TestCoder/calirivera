import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditableText } from "@/components/cms/editable";
import { ArtImage } from "@/components/media/ArtImage";
import { getMemory, listMemories, listSlugs } from "@/lib/content/repo";
import { COLLECTIONS } from "@/lib/content/types";
import { KIND_LABEL, SOURCE_LABEL } from "@/lib/memoria/layout";
import s from "./recuerdo.module.scss";

const EMPTY = "__vacio";

export async function generateStaticParams() {
  const slugs = await listSlugs(COLLECTIONS.memories);
  return (slugs.length ? slugs : [EMPTY]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/memoria/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const m = slug === EMPTY ? null : await getMemory(slug);
  const t = m?.title || (m?.year ? `Recuerdo de ${m.year}` : "Recuerdo");
  return { title: `${t} · Memoria del Taller`, description: m?.caption ?? undefined, openGraph: m ? { images: [m.image.src] } : undefined };
}

async function Content({ params }: { params: PageProps<"/memoria/[slug]">["params"] }) {
  const { slug } = await params;
  const m = slug === EMPTY ? null : await getMemory(slug);
  if (!m || m.status === "draft") notFound();
  const all = await listMemories();
  const i = all.findIndex((x) => x.id === m.id);
  const prev = i > 0 ? all[i - 1] : null;
  const next = i >= 0 && i < all.length - 1 ? all[i + 1] : null;
  const path = `memories/${m.id}`;
  const year = m.year ? `${m.yearApprox ? "c. " : ""}${m.year}` : "";
  const title = m.title || (year ? `Recuerdo de ${year}` : "Recuerdo");
  const label = (x: typeof prev) => (x ? x.title || (x.year ? `Recuerdo de ${x.year}` : "Recuerdo") : "");
  return (
    <article className={s.page}>
      <nav className={s.crumbs} aria-label="Ruta">
        <Link href="/memoria">Memoria</Link>
        {m.year && (
          <>
            <span aria-hidden> / </span>
            <Link href={`/memoria#y${parseInt(String(m.year), 10) || "sin-fecha"}`}>{String(m.year)}</Link>
          </>
        )}
      </nav>
      <div className={s.layout}>
        <ArtImage image={m.image} path={`${path}#image`} priority sizes="(min-width: 60em) 60vw, 100vw" className={s.figure} />
        <div className={s.text}>
          <p className={s.meta}>{[year, KIND_LABEL[m.kind], m.place].filter(Boolean).join(" · ")}</p>
          {m.title ? <EditableText path={`${path}#title`} value={m.title} as="h1" className={s.title} /> : <h1 className={s.title}>{title}</h1>}
          {m.caption && <EditableText path={`${path}#caption`} value={m.caption} as="p" multiline className={s.caption} />}
          {m.aiAltered && <p className={s.notice}>Esta imagen pasó por inteligencia artificial en el sitio actual. Puede no ser fiel al original.</p>}
          {m.lostInFire && <p className={s.notice}>Esta obra se perdió en el incendio del 8 de noviembre de 2017.</p>}
          <dl className={s.facts}>
            {m.people?.length ? (
              <>
                <dt>Personas</dt>
                <dd>{m.people.join(", ")}</dd>
              </>
            ) : null}
            <dt>Fuente</dt>
            <dd>
              {SOURCE_LABEL[m.source] ?? m.source}
              {m.sourceUrl && (
                <>
                  {" · "}
                  <a href={m.sourceUrl} target="_blank" rel="noopener">
                    ver original
                  </a>
                </>
              )}
            </dd>
            {m.seenAt && (
              <>
                <dt>Archivada</dt>
                <dd>{new Date(m.seenAt).toLocaleDateString("es-CR", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</dd>
              </>
            )}
            {m.yearApprox && (
              <>
                <dt>Año</dt>
                <dd>Aproximado, según la serie o la fecha en que se publicó en el sitio.</dd>
              </>
            )}
          </dl>
          {m.collectionId && (
            <p>
              <Link href={`/colecciones/${m.collectionId}`} className={s.link}>
                Ver la colección
              </Link>
            </p>
          )}
        </div>
      </div>
      <nav className={s.pager} aria-label="Otros recuerdos">
        {prev ? (
          <Link href={`/memoria/${prev.slug}`} rel="prev">
            <span aria-hidden>←</span> {label(prev)}
          </Link>
        ) : (
          <i />
        )}
        {next ? (
          <Link href={`/memoria/${next.slug}`} rel="next">
            {label(next)} <span aria-hidden>→</span>
          </Link>
        ) : (
          <i />
        )}
      </nav>
    </article>
  );
}

export default function Recuerdo(props: PageProps<"/memoria/[slug]">) {
  return (
    <Suspense fallback={<article className={s.page} aria-busy="true" />}>
      <Content params={props.params} />
    </Suspense>
  );
}
