/**
 * What the CMS can edit and how each form looks. Pure + serializable (sent to client forms).
 */
import type { LayoutPreset } from "@/lib/content/types";

export const CONTENT_COLLECTIONS = ["pages", "collections", "artworks", "catalogs", "programs", "people", "posts", "settings"] as const;
export type ContentCollection = (typeof CONTENT_COLLECTIONS)[number];
export const SYSTEM_COLLECTIONS = ["authCodes", "rateLimits", "auditLog", "drafts"] as const;

export const isContentCollection = (c: string): c is ContentCollection => (CONTENT_COLLECTIONS as readonly string[]).includes(c);

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "multiselect"
  | "boolean"
  | "image"
  | "images"
  | "blocks"
  | "sections"
  | "links"
  | "tags"
  | "slug"
  | "url";

export interface FieldDef {
  name: string; // dot path, e.g. "hero.title"
  label: string;
  type: FieldType;
  required?: boolean;
  max?: number;
  rows?: number;
  help?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Options loaded on the server: list of docs from this collection. */
  optionsFrom?: ContentCollection;
  /** Shown in the quick "+" form of the inline editor. */
  quick?: boolean;
  /** Field can't be changed after creation. */
  lockedAfterCreate?: boolean;
}

export interface CollectionDef {
  name: ContentCollection;
  label: string; // plural, UI
  singular: string; // "obra", "entrada"
  titleField: string;
  /** Article for "Nueva/Nuevo". */
  gender: "f" | "m";
  icon: string;
  description: string;
  fields: FieldDef[];
  imageField?: string;
  sort: "updatedAt" | "publishedAt" | "order";
  /** Single document (settings). */
  singleton?: string;
  /** Item type names used by EditableList's itemType for "+" in collection lists. */
  itemTypes: string[];
}

export const PROGRAM_OPTIONS = [
  { value: "colaboracion", label: "Colaboración al Artista Nacional" },
  { value: "incubadora", label: "La Incubadora (jueves)" },
  { value: "jovenes-talentos", label: "Jóvenes Talentos (viernes)" },
];

export const LAYOUT_OPTIONS: { value: LayoutPreset; label: string; hint: string }[] = [
  { value: "auto", label: "Automático", hint: "El sitio elige según el largo del texto" },
  { value: "editorial-columns", label: "Columnas de revista", hint: "Texto largo en columnas" },
  { value: "split-sticky", label: "Imagen fija + texto", hint: "La imagen queda quieta mientras se lee" },
  { value: "fullbleed-image", label: "Imagen a todo lo ancho", hint: "Una foto protagonista" },
  { value: "horizontal-track", label: "Recorrido horizontal", hint: "Las piezas pasan de lado" },
  { value: "kinetic-statement", label: "Frase grande", hint: "Una idea corta, en grande" },
  { value: "gallery-masonry", label: "Galería", hint: "Muchas fotos juntas" },
  { value: "poem-center", label: "Poema", hint: "Versos centrados" },
];

export const TONE_OPTIONS = [
  { value: "paper", label: "Papel (claro)" },
  { value: "ink", label: "Tinta (oscuro)" },
  { value: "clay", label: "Barro" },
  { value: "blue", label: "Azul" },
];

const slug: FieldDef = {
  name: "slug",
  label: "Dirección (URL)",
  type: "slug",
  help: "Se crea sola a partir del título. Cambiarla rompe los enlaces que ya se compartieron.",
  lockedAfterCreate: true,
};
const order: FieldDef = { name: "order", label: "Orden", type: "number", help: "Número menor aparece primero." };

export const COLLECTION_DEFS: Record<ContentCollection, CollectionDef> = {
  posts: {
    name: "posts",
    label: "Bitácora",
    singular: "entrada",
    gender: "f",
    icon: "✎",
    description: "Eventos, noticias y lo que pasa en el Taller.",
    titleField: "title",
    imageField: "cover",
    sort: "publishedAt",
    itemTypes: ["post", "posts"],
    fields: [
      { name: "title", label: "Título", type: "text", required: true, max: 120, quick: true },
      { name: "publishedAt", label: "Fecha", type: "date", required: true, quick: true },
      { name: "programKind", label: "Programa", type: "select", options: [{ value: "", label: "Ninguno" }, ...PROGRAM_OPTIONS] },
      { name: "excerpt", label: "Resumen corto", type: "textarea", max: 280, rows: 3, quick: true, help: "Aparece en la lista de la Bitácora." },
      { name: "cover", label: "Foto principal", type: "image", quick: true },
      { name: "body", label: "Contenido", type: "blocks" },
      { name: "tags", label: "Etiquetas", type: "tags", help: "Separadas por coma." },
      slug,
    ],
  },
  people: {
    name: "people",
    label: "Personas y beneficiarios",
    singular: "persona",
    gender: "f",
    icon: "☺",
    description: "Artistas, poetas, músicos y beneficiarios de los programas.",
    titleField: "name",
    imageField: "portrait",
    sort: "order",
    itemTypes: ["person", "people", "beneficiary"],
    fields: [
      { name: "name", label: "Nombre", type: "text", required: true, max: 100, quick: true },
      { name: "programKinds", label: "Programas", type: "multiselect", options: PROGRAM_OPTIONS, required: true, quick: true },
      { name: "discipline", label: "Disciplina", type: "text", max: 60, placeholder: "poeta, músico, bailarina…", quick: true },
      { name: "portrait", label: "Foto", type: "image", quick: true },
      { name: "bio", label: "Biografía corta", type: "textarea", max: 1200, rows: 5 },
      { name: "achievement", label: "Logro", type: "text", max: 160, placeholder: "1er lugar mundial de halterofilia, Atenas" },
      { name: "supportGiven", label: "Qué hizo el Taller", type: "textarea", max: 600, rows: 3, placeholder: "Patrocinio, vestuario, evento de recibimiento…" },
      { name: "date", label: "Fecha", type: "date" },
      { name: "featured", label: "Obra destacada (un poema, un texto…)", type: "blocks" },
      { name: "links", label: "Enlaces", type: "links" },
      order,
      slug,
    ],
  },
  artworks: {
    name: "artworks",
    label: "Obras",
    singular: "obra",
    gender: "f",
    icon: "▣",
    description: "Cada pieza con su ficha técnica.",
    titleField: "title",
    imageField: "images.0",
    sort: "order",
    itemTypes: ["artwork", "artworks"],
    fields: [
      { name: "title", label: "Título", type: "text", required: true, max: 120, quick: true },
      { name: "images", label: "Fotos", type: "images", required: true, quick: true },
      { name: "year", label: "Año", type: "text", max: 20, placeholder: "1996", quick: true },
      { name: "technique", label: "Técnica", type: "text", max: 120, placeholder: "Óleo sobre tela", quick: true },
      { name: "dimensions", label: "Medidas", type: "text", max: 60, placeholder: "120 × 90 cm", quick: true },
      { name: "collectionId", label: "Colección", type: "select", optionsFrom: "collections" },
      {
        name: "availability",
        label: "Estado de la obra",
        type: "select",
        options: [
          { value: "", label: "Sin indicar" },
          { value: "available", label: "Disponible" },
          { value: "sold", label: "Vendida" },
          { value: "private-collection", label: "Colección privada" },
          { value: "lost", label: "Perdida (incendio)" },
          { value: "unknown", label: "Paradero desconocido" },
        ],
      },
      { name: "aiAltered", label: "La foto fue alterada con IA", type: "boolean", help: "Marcala si la imagen no es una foto fiel de la obra. No se mostrará como obra hasta reemplazarla." },
      { name: "notes", label: "Notas", type: "textarea", max: 1500, rows: 4 },
      order,
      slug,
    ],
  },
  collections: {
    name: "collections",
    label: "Colecciones",
    singular: "colección",
    gender: "f",
    icon: "◫",
    description: "Las series: Atmósfera, Musas del Cántaro, Sueños en Azul…",
    titleField: "title",
    imageField: "cover",
    sort: "order",
    itemTypes: ["collection", "collections"],
    fields: [
      { name: "title", label: "Título", type: "text", required: true, max: 80, quick: true },
      { name: "period", label: "Años", type: "text", max: 40, placeholder: "1995–1996", quick: true },
      { name: "cover", label: "Portada", type: "image", quick: true },
      { name: "statement", label: "Texto de la colección", type: "textarea", max: 6000, rows: 8 },
      order,
      slug,
    ],
  },
  catalogs: {
    name: "catalogs",
    label: "Catálogos y proyectos",
    singular: "catálogo",
    gender: "m",
    icon: "▤",
    description: "Catálogos en PDF, proyectos y exposiciones.",
    titleField: "title",
    imageField: "cover",
    sort: "order",
    itemTypes: ["catalog", "catalogs", "project", "exhibition"],
    fields: [
      { name: "title", label: "Título", type: "text", required: true, max: 120, quick: true },
      {
        name: "kind",
        label: "Tipo",
        type: "select",
        required: true,
        quick: true,
        options: [
          { value: "catalog", label: "Catálogo" },
          { value: "project", label: "Proyecto" },
          { value: "exhibition", label: "Exposición" },
        ],
      },
      { name: "year", label: "Año", type: "text", max: 20, quick: true },
      { name: "summary", label: "Resumen", type: "textarea", max: 600, rows: 3, quick: true },
      { name: "cover", label: "Portada", type: "image" },
      { name: "fileUrl", label: "Enlace al PDF", type: "url", placeholder: "https://…" },
      { name: "body", label: "Contenido", type: "blocks" },
      order,
      slug,
    ],
  },
  programs: {
    name: "programs",
    label: "Programas del Taller",
    singular: "programa",
    gender: "m",
    icon: "◎",
    description: "Colaboración, La Incubadora y Jóvenes Talentos.",
    titleField: "title",
    imageField: "cover",
    sort: "order",
    itemTypes: ["program", "programs"],
    fields: [
      { name: "kind", label: "Programa", type: "select", options: PROGRAM_OPTIONS, required: true, lockedAfterCreate: true },
      { name: "title", label: "Título", type: "text", required: true, max: 100 },
      { name: "schedule", label: "Cuándo", type: "text", max: 60, placeholder: "Todos los jueves" },
      { name: "summary", label: "Resumen", type: "textarea", max: 400, rows: 3 },
      { name: "cover", label: "Foto", type: "image" },
      { name: "body", label: "Contenido", type: "blocks" },
      order,
    ],
  },
  pages: {
    name: "pages",
    label: "Páginas",
    singular: "página",
    gender: "f",
    icon: "▭",
    description: "Inicio, Biografía, Taller del Artista, Manifiesto…",
    titleField: "title",
    imageField: "hero.image",
    sort: "order",
    itemTypes: ["page", "pages"],
    fields: [
      { name: "title", label: "Título", type: "text", required: true, max: 100 },
      { name: "hero.title", label: "Portada: título grande", type: "text", max: 120 },
      { name: "hero.subtitle", label: "Portada: subtítulo", type: "text", max: 200 },
      { name: "hero.image", label: "Portada: imagen", type: "image" },
      { name: "description", label: "Descripción", type: "textarea", max: 300, rows: 3 },
      { name: "sections", label: "Secciones", type: "sections" },
      { name: "seo.title", label: "Google: título", type: "text", max: 70 },
      { name: "seo.description", label: "Google: descripción", type: "textarea", max: 160, rows: 2 },
      slug,
    ],
  },
  settings: {
    name: "settings",
    label: "Ajustes",
    singular: "ajustes",
    gender: "m",
    icon: "⚙",
    description: "Nombre, lema, contacto y redes.",
    titleField: "siteName",
    sort: "updatedAt",
    singleton: "site",
    itemTypes: [],
    fields: [
      { name: "siteName", label: "Nombre del sitio", type: "text", required: true, max: 60 },
      { name: "tagline", label: "Lema", type: "text", required: true, max: 120 },
      { name: "email", label: "Correo de contacto", type: "text", required: true, max: 120 },
      { name: "location", label: "Ubicación", type: "text", max: 120 },
      { name: "footerNote", label: "Nota del pie de página", type: "text", max: 160 },
      { name: "social", label: "Redes sociales", type: "links" },
    ],
  },
};

/** itemType (from EditableList) → collection for collection-level lists. */
export function collectionForItemType(itemType: string): ContentCollection | null {
  for (const def of Object.values(COLLECTION_DEFS)) if (def.itemTypes.includes(itemType)) return def.name;
  return null;
}

/** Public URL of a document, for "Ver en el sitio". */
export function publicUrl(collection: string, doc: { slug?: string; id: string; kind?: string }): string | null {
  const slug = doc.slug ?? doc.id;
  switch (collection) {
    case "pages":
      return slug === "inicio" || slug === "home" ? "/" : `/${slug}`;
    case "collections":
      return `/colecciones/${slug}`;
    case "artworks":
      return `/obra/${slug}`;
    case "catalogs":
      return `/catalogos-and-proyectos/${slug}`;
    case "posts":
      return `/bitacora/${slug}`;
    case "programs":
      return doc.kind === "colaboracion"
        ? "/colaboracion-al-artista-nacional"
        : doc.kind === "incubadora"
          ? "/la-incubadora"
          : doc.kind === "jovenes-talentos"
            ? "/jovenes-talentos"
            : null;
    case "settings":
      return "/";
    default:
      return null;
  }
}

export const BLOCK_TYPES = [
  { value: "paragraph", label: "Párrafo", icon: "¶" },
  { value: "heading", label: "Título", icon: "H" },
  { value: "image", label: "Foto", icon: "▣" },
  { value: "gallery", label: "Galería", icon: "▦" },
  { value: "quote", label: "Cita", icon: "❝" },
  { value: "poem", label: "Poema", icon: "✿" },
] as const;
