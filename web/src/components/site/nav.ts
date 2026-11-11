export type NavItem = { href: string; label: string };
export type NavGroup = { group: string; items: NavItem[] };

/** Navegación principal agrupada (el menú muestra la obra primero, luego el Taller). */
export const NAV: NavGroup[] = [
  {
    group: "Obra",
    items: [
      { href: "/biografia", label: "Biografía" },
      { href: "/colecciones", label: "Colecciones" },
      { href: "/catalogos-and-proyectos", label: "Catálogos y proyectos" },
      { href: "/trayectoria-and-entrevistas", label: "Trayectoria y entrevistas" },
      { href: "/manifiesto", label: "Manifiesto" },
    ],
  },
  {
    group: "Taller del Artista",
    items: [
      { href: "/taller-del-artista", label: "El Taller" },
      { href: "/colaboracion-al-artista-nacional", label: "Colaboración al artista nacional" },
      { href: "/la-incubadora", label: "La Incubadora" },
      { href: "/jovenes-talentos", label: "Jóvenes Talentos" },
      { href: "/bitacora", label: "Bitácora" },
      { href: "/memoria", label: "Memoria del Taller" },
    ],
  },
];
