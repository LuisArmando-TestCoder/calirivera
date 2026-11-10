import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EditableText } from "@/components/cms/editable";
import { SectionRenderer } from "@/components/layout-engine/SectionRenderer";
import { ArtImage } from "@/components/media/ArtImage";
import { NarrationSlot } from "@/components/narration/NarrationSlot";
import { getPage, getProgram, getSettings } from "@/lib/content/repo";
import type { AnyBlock } from "@/lib/content/types";
import s from "./taller.module.scss";

export async function generateMetadata(): Promise<Metadata> {
  const p = await getPage("taller-del-artista");
  return { title: "Taller del Artista", description: p?.description };
}

export default async function Taller() {
  const [page, settings, col, inc, jov] = await Promise.all([
    getPage("taller-del-artista"), getSettings(), getProgram("colaboracion"), getProgram("incubadora"), getProgram("jovenes-talentos"),
  ]);
  if (!page) notFound();
  const visita = page.sections.find((x) => x.id === "visita");
  const menu = (visita?.blocks as AnyBlock[] | undefined)?.flatMap((b) => (b.type === "links" ? b.items : [])).find((x) => x.kind === "pdf");
  const programs = [
    col && { href: "/colaboracion-al-artista-nacional", p: col },
    inc && { href: "/la-incubadora", p: inc },
    jov && { href: "/jovenes-talentos", p: jov },
  ].filter(Boolean) as { href: string; p: NonNullable<typeof col> }[];
  return (
    <>
      <header className={s.hero}>
        <NarrationSlot beat="19" />
        {page.hero?.image && (
          <div className={s.heroMedia}>
            <div className={s.heroImg} data-parallax="0.12">
              <ArtImage image={page.hero.image} path="pages/taller-del-artista#hero.image" priority fit="cover" frame={false} sizes="100vw" />
            </div>
          </div>
        )}
        <div className={s.heroText}>
          <p className={s.since}>Desde 2000</p>
          <h1 className={s.title}>Taller<br />del Artista</h1>
          {page.hero?.subtitle && <EditableText path="pages/taller-del-artista#hero.subtitle" value={page.hero.subtitle} as="p" className={s.sub} />}
        </div>
      </header>

      {/* Ficha de visita fija a la izquierda; la historia corre a la derecha */}
      <div className={s.layout}>
        <aside className={s.card} aria-label="Visitar el Taller">
          {settings.address && <address className={s.addr}>{settings.address}</address>}
          {settings.hours && (
            <dl className={s.hours}>
              {settings.hours.map((h) => (<div key={h.days}><dt>{h.days}</dt><dd>{h.time}</dd></div>))}
            </dl>
          )}
          <div className={s.actions}>
            {settings.whatsapp && <a className={s.primary} href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`}>Escribir por WhatsApp</a>}
            {settings.mapUrl && <a className={s.secondary} href={settings.mapUrl} target="_blank" rel="noopener">Cómo llegar</a>}
            {menu && <a className={s.secondary} href={menu.href} target="_blank" rel="noopener">Ver el menú{menu.note ? ` (${menu.note})` : ""}</a>}
          </div>
        </aside>
        <div className={s.story}>
          {page.sections.map((sec, i) =>
            sec.id === "visita" ? null : (
              <SectionRenderer key={sec.id} section={sec} base={`pages/taller-del-artista#sections.${i}`} index={i} />
            ),
          )}
        </div>
      </div>

      <section className={s.programs} aria-labelledby="taller-programas">
        <h2 id="taller-programas" className={s.h2}>Lo que se hace aquí</h2>
        <ul className={s.programList}>
          {programs.map(({ href, p }) => (
            <li key={p.kind}>
              <Link href={href} className={s.program}>
                <span className={s.day}>{p.schedule ?? "Todo el año"}</span>
                <span className={s.pTitle}>{p.title}</span>
                {p.summary && <span className={s.pSummary}>{p.summary}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
