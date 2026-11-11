/** Site map — single source for nav, sitemap (branch 8) and placeholders. */
export const ROUTES = [
  { href: "/", label: "Inicio" },
  { href: "/biografia", label: "Biografía" },
  { href: "/catalogos-and-proyectos", label: "Catálogos & Proyectos" },
  { href: "/colecciones", label: "Colecciones" },
  { href: "/trayectoria-and-entrevistas", label: "Trayectoria & Entrevistas" },
  { href: "/taller-del-artista", label: "Taller del Artista" },
  { href: "/colaboracion-al-artista-nacional", label: "Colaboración al Artista Nacional" },
  { href: "/la-incubadora", label: "La Incubadora" },
  { href: "/jovenes-talentos", label: "Jóvenes Talentos" },
  { href: "/bitacora", label: "Bitácora" },
  { href: "/memoria", label: "Memoria" },
  { href: "/manifiesto", label: "Manifiesto" },
] as const;

/** Old Hostinger URLs for collections (top-level) → new nested route. */
export const LEGACY_COLLECTION_SLUGS = [
  "atmosfera",
  "musas-del-cantaro",
  "suenos-en-azul",
  "detras-de-la-ventana",
  "exvotos",
  "plegaria",
  "la-cofradia",
] as const;
