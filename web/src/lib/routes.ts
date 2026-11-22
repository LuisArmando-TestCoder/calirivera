/** Site map — single source for nav, sitemap (branch 8) and placeholders. */
export const ROUTES = [
  { href: "/", label: "Inicio" },
  { href: "/biografia", label: "Biografía" },
  { href: "/catalogos-and-proyectos", label: "Catálogos & Proyectos" },
  { href: "/colecciones", label: "Colecciones" },
  { href: "/trayectoria-and-entrevistas", label: "Trayectoria & Entrevistas" },
  { href: "/puntos-de-vista", label: "Puntos de vista" },
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

/** Direcciones del sitio de 2026 en Hostinger (con el año pegado) → su lugar acá. */
export const LEGACY_2026: Record<string, string> = {
  // obra que estaba repetida: era la de Exvotos
  "/obra/identidad-identidad-mundo": "/obra/exvotos-03",
  "/obras": "/colecciones",
  "/atmosfera-1993": "/colecciones/atmosfera",
  "/musas-del-cantaro-1995": "/colecciones/musas-del-cantaro",
  "/suenos-en-azul-1996": "/colecciones/suenos-en-azul",
  "/detras-de-la-ventana-2000": "/colecciones/detras-de-la-ventana",
  "/ave-fenix-2000": "/colecciones/ave-fenix",
  "/plegaria-2001": "/colecciones/plegaria",
  "/poetry-2001": "/catalogos-and-proyectos/poetry",
  "/transmutacion-2003": "/colecciones/transmutacion",
  "/player-flags-2003": "/colecciones/prayer-flags",
  "/globalizacion-2004": "/colecciones/globalizacion",
  "/el-agua-como-elemento-2006": "/colecciones/el-agua-como-elemento",
  "/plegaria-tica-en-francia-2006": "/colecciones/plegaria-tica-en-francia",
  "/exvotos-2012": "/colecciones/exvotos",
};
