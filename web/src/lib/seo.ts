/**
 * Datos estructurados (schema.org, JSON-LD) y URL del sitio. Todo sale del contenido real: nada inventado.
 * Lo leen Google y Bing, y también los asistentes (ChatGPT, Claude, Perplexity) cuando buscan en la web.
 */
import type { Artwork, Collection, Post, PressArticle, SiteSettings } from "@/lib/content/types";

export const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://calirivera.com").replace(/\/+$/, "");
export const abs = (path: string) => (path.startsWith("http") ? path : `${SITE}${path.startsWith("/") ? "" : "/"}${path}`);

const PERSON_ID = `${SITE}/#cali-rivera`;
const TALLER_ID = `${SITE}/#taller-del-artista`;

export function siteGraph(s: SiteSettings, image?: string) {
  const sameAs = s.social.map((x) => x.href);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE}/#sitio`,
        url: SITE,
        name: s.siteName,
        description: s.footerNote,
        inLanguage: "es-CR",
        publisher: { "@id": PERSON_ID },
      },
      {
        "@type": "Person",
        "@id": PERSON_ID,
        name: "Cali Rivera",
        url: `${SITE}/biografia`,
        ...(image ? { image: abs(image) } : {}),
        description: "Artista multidisciplinario costarricense nacido en San José en 1969. Pintor, creador de instalaciones, arte objeto y obras textiles. Fundador del Taller del Artista en Tres Ríos, Costa Rica.",
        jobTitle: "Artista multidisciplinario",
        birthDate: "1969",
        nationality: { "@type": "Country", name: "Costa Rica" },
        birthPlace: { "@type": "Place", name: "San José, Costa Rica" },
        knowsAbout: ["Pintura", "Arte textil", "Instalación", "Arte objeto", "Arte costarricense"],
        email: `mailto:${s.email}`,
        sameAs,
        founder: { "@id": TALLER_ID },
        mainEntityOfPage: `${SITE}/biografia`,
      },
      ...(s.address
        ? [
            {
              "@type": ["ArtGallery", "LocalBusiness"],
              "@id": TALLER_ID,
              name: "Taller del Artista",
              url: `${SITE}/taller-del-artista`,
              description: "Espacio fundado por Cali Rivera en Tres Ríos, Costa Rica, concebido para el encuentro entre diferentes manifestaciones artísticas y como plataforma para artistas nacionales e internacionales.",
              founder: { "@id": PERSON_ID },
              address: { "@type": "PostalAddress", streetAddress: s.address, addressLocality: "Tres Ríos", addressCountry: "CR" },
              ...(s.whatsapp ? { telephone: s.whatsapp } : {}),
              email: s.email,
              ...(s.mapUrl ? { hasMap: s.mapUrl } : {}),
              ...(s.hours?.length ? { openingHours: s.hours.map((h) => `${h.days}: ${h.time}`) } : {}),
            },
          ]
        : []),
    ],
  };
}

export function artworkLd(w: Artwork, c: Collection | null) {
  const img = w.images[0];
  return {
    "@context": "https://schema.org",
    "@type": "VisualArtwork",
    "@id": `${SITE}/obra/${w.slug}`,
    url: `${SITE}/obra/${w.slug}`,
    name: w.title,
    creator: { "@id": PERSON_ID, "@type": "Person", name: "Cali Rivera" },
    ...(w.year ? { dateCreated: String(w.year) } : {}),
    ...(w.technique ? { artMedium: w.technique } : {}),
    ...(w.dimensions ? { size: w.dimensions } : {}),
    ...(img ? { image: abs(img.src) } : {}),
    ...(c ? { isPartOf: { "@type": "CreativeWorkSeries", name: c.title, url: `${SITE}/colecciones/${c.slug}` } } : {}),
    inLanguage: "es",
  };
}

export function collectionLd(c: Collection, works: Artwork[]) {
  return {
    "@context": "https://schema.org",
    "@type": ["CollectionPage", "CreativeWorkSeries"],
    "@id": `${SITE}/colecciones/${c.slug}`,
    url: `${SITE}/colecciones/${c.slug}`,
    name: c.title,
    ...(c.statement ? { description: c.statement.slice(0, 500) } : {}),
    ...(c.period ? { temporalCoverage: c.period } : {}),
    ...(c.cover ? { image: abs(c.cover.src) } : {}),
    creator: { "@id": PERSON_ID, "@type": "Person", name: "Cali Rivera" },
    inLanguage: "es",
    hasPart: works.slice(0, 60).map((w) => ({ "@type": "VisualArtwork", name: w.title, url: `${SITE}/obra/${w.slug}` })),
  };
}

export function articleLd(a: Post | PressArticle, path: string, extra: { publisher?: string; author?: string } = {}) {
  return {
    "@context": "https://schema.org",
    "@type": extra.publisher ? "NewsArticle" : "BlogPosting",
    "@id": `${SITE}${path}`,
    url: `${SITE}${path}`,
    headline: a.title.slice(0, 110),
    ...(a.excerpt ? { description: a.excerpt } : {}),
    datePublished: a.publishedAt,
    dateModified: a.updatedAt ?? a.publishedAt,
    ...(a.cover ? { image: abs(a.cover.src) } : {}),
    author: extra.author ? { "@type": "Person", name: extra.author } : { "@id": PERSON_ID, "@type": "Person", name: "Cali Rivera" },
    ...(extra.publisher ? { publisher: { "@type": "Organization", name: extra.publisher } } : {}),
    about: { "@id": PERSON_ID },
    inLanguage: "es",
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${SITE}${it.path}` })),
  };
}

/** <script type="application/ld+json"> seguro (sin </script> dentro). */
export const ldJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
