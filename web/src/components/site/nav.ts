export type NavItem = { href: string; label: string; /** una línea que dice qué hay ahí */ note?: string };
export type NavGroup = { group: string; items: NavItem[] };

/** Navegación principal agrupada (el menú muestra la obra primero, luego el Taller). */
export const NAV: NavGroup[] = [
  {
    group: "Obra",
    items: [
      { href: "/biografia", label: "Biografía", note: "Quién es Cali Rivera" },
      { href: "/colecciones", label: "Colecciones", note: "La obra, capítulo por capítulo" },
      { href: "/catalogos-and-proyectos", label: "Catálogos y proyectos", note: "Libros para hojear y archivo de proyectos" },
      { href: "/trayectoria-and-entrevistas", label: "Trayectoria y entrevistas", note: "Exposiciones, currículum y entrevistas" },
      { href: "/puntos-de-vista", label: "Puntos de vista", note: "Lo que escribieron la crítica y la prensa" },
      { href: "/manifiesto", label: "Manifiesto", note: "El arte es para ser libres" },
    ],
  },
  {
    group: "Taller del Artista",
    items: [
      { href: "/taller-del-artista", label: "El Taller", note: "La casa del arte en Tres Ríos" },
      { href: "/colaboracion-al-artista-nacional", label: "Colaboración al artista nacional", note: "Un escenario para quien empieza" },
      { href: "/la-incubadora", label: "La Incubadora", note: "Los jueves, artistas nuevos" },
      { href: "/jovenes-talentos", label: "Jóvenes Talentos", note: "Los viernes, talento joven" },
      { href: "/bitacora", label: "Bitácora", note: "Lo que fue pasando, mes a mes" },
      { href: "/memoria", label: "Memoria del Taller", note: "Las fotos de siempre, desde 1993" },
    ],
  },
];
