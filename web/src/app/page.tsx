import Link from "next/link";
import { Banners } from "@/components/hero/Banners";
import { CollectionBanner } from "@/components/art/CollectionBanner";
import { SectionRenderer } from "@/components/layout-engine/SectionRenderer";
import { ArtImage } from "@/components/media/ArtImage";
import { NarrationSlot } from "@/components/narration/NarrationSlot";
import { EditableList } from "@/components/cms/editable";
import { getPage, getProgram, listCollections, listPosts } from "@/lib/content/repo";
import { formatMonth } from "@/lib/format";
import s from "./home.module.scss";

export default async function Home() {
  const [page, collections, posts, taller, incubadora, jovenes, colaboracion] = await Promise.all([
    getPage("inicio"),
    listCollections(),
    listPosts(),
    getPage("taller-del-artista"),
    getProgram("incubadora"),
    getProgram("jovenes-talentos"),
    getProgram("colaboracion"),
  ]);
  const hero = page?.hero ?? { title: "Cali Rivera", subtitle: "El arte es para ser libres." };
  const statement = page?.sections.find((x) => x.id === "quien-es");
  const collIntro = page?.sections.find((x) => x.id === "colecciones");
  const programs = [colaboracion, incubadora, jovenes].filter(Boolean);
  const pIdx = (id: string) => page?.sections.findIndex((x) => x.id === id) ?? 0;

  return (
    <>
      <Banners name={hero.title} tagline={hero.subtitle ?? ""} cta={hero.cta} path="pages/inicio#hero" />

      {statement && (
        <>
          <NarrationSlot beat="02" />
          <SectionRenderer section={statement} base={`pages/inicio#sections.${pIdx("quien-es")}`} />
        </>
      )}

      <section className={s.collections} data-pin-track aria-labelledby="home-colecciones">
        <NarrationSlot beat="10" />
        <div className={s.collHead}>
          <h2 id="home-colecciones" className={s.h2}>Colecciones</h2>
          {collIntro?.blocks.map((b) => (b.type === "paragraph" ? <p key={b.id} className={s.collLead}>{b.text}</p> : null))}
          <Link href="/colecciones" className={s.textLink}>Ver todas las colecciones</Link>
        </div>
        <div className={s.line} aria-hidden />
        <div className={s.trackViewport}>
          <EditableList path="collections" itemType="collection" className={s.track}>
            {collections.map((c, i) => (
              <div key={c.id} className={s.trackItem}>
                <CollectionBanner c={c} index={i} />
              </div>
            ))}
          </EditableList>
        </div>
      </section>

      {taller && (
        <section className={s.taller} aria-labelledby="home-taller">
          <NarrationSlot beat="19" />
          <div className={s.tallerMedia}>
            {taller.hero?.image && (
              <div data-parallax="0.1" className={s.tallerImg}>
                <ArtImage image={taller.hero.image} path="pages/taller-del-artista#hero.image" fit="cover" frame={false} sizes="(min-width: 60em) 55vw, 100vw" />
              </div>
            )}
          </div>
          <div className={s.tallerText}>
            <p className={s.kicker}>Desde el 7 de marzo de 2000 · Tres Ríos</p>
            <h2 id="home-taller" className={s.h2}>Taller del Artista</h2>
            {taller.hero?.subtitle && <p className={s.tallerLead}>{taller.hero.subtitle}</p>}
            <ul className={s.programs}>
              {programs.map((p) => p && (
                <li key={p.kind}>
                  <Link href={programHref(p.kind)} className={s.program}>
                    <span className={s.programDay}>{p.schedule ?? "Todo el año"}</span>
                    <span className={s.programName}>{p.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/taller-del-artista" className={s.textLink}>Visitar el Taller</Link>
          </div>
        </section>
      )}

      {posts.length > 0 && (
        <section className={s.log} aria-labelledby="home-bitacora">
          <NarrationSlot beat="23" />
          <div className={s.logHead}>
            <h2 id="home-bitacora" className={s.h2}>Bitácora</h2>
            <Link href="/bitacora" className={s.textLink}>Todo el archivo ({posts.length})</Link>
          </div>
          <ol className={s.logList}>
            {posts.slice(0, 4).map((p) => (
              <li key={p.id}>
                <Link href={`/bitacora/${p.slug}`} className={s.logItem}>
                  <time dateTime={p.publishedAt} className={s.logDate}>{formatMonth(p.publishedAt)}</time>
                  <span className={s.logTitle}>{p.title}</span>
                  {p.excerpt && <span className={s.logExcerpt}>{p.excerpt}</span>}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

function programHref(kind: string) {
  return kind === "colaboracion" ? "/colaboracion-al-artista-nacional" : kind === "incubadora" ? "/la-incubadora" : "/jovenes-talentos";
}
