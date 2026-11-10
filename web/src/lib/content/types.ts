/**
 * Content model — Cali Rivera / Taller del Artista.
 * Mirrors Firestore collections (see docs/FIRESTORE_SCHEMA.md) and the local
 * JSON fallback in ../content.
 */

export type ISODate = string;
export type Status = "draft" | "published";

export interface Timestamps {
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Publishable extends Timestamps {
  id: string;
  slug: string;
  status: Status;
  /** Manual order inside lists (lower first). */
  order?: number;
}

export interface ImageAsset {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  /** Tiny base64 / dominant colour for blur-up placeholders. */
  placeholder?: string;
  /** Low-resolution source → layouts favour blur/zoom treatments. */
  lowRes?: boolean;
  credit?: string;
}

// ---------- Blocks ----------
export type Block =
  | { type: "heading"; id: string; level: 1 | 2 | 3 | 4; text: string }
  | { type: "paragraph"; id: string; text: string }
  | { type: "image"; id: string; image: ImageAsset; caption?: string }
  | { type: "gallery"; id: string; images: ImageAsset[]; caption?: string }
  | { type: "quote"; id: string; text: string; cite?: string }
  | { type: "poem"; id: string; title?: string; author?: string; lines: string[] };

export type BlockType = Block["type"];

/** Layout presets the procedural engine (branch 5) can pick from. */
export type LayoutPreset =
  | "auto"
  | "editorial-columns"
  | "split-sticky"
  | "fullbleed-image"
  | "horizontal-track"
  | "kinetic-statement"
  | "gallery-masonry"
  | "poem-center";

export interface Section {
  id: string;
  title?: string;
  layout: LayoutPreset;
  blocks: Block[];
  /** Optional theme override per section. */
  tone?: "paper" | "ink" | "clay" | "blue";
}

export interface Page extends Publishable {
  title: string;
  description?: string;
  hero?: { title: string; subtitle?: string; image?: ImageAsset; cta?: { label: string; href: string } };
  sections: Section[];
  seo?: { title?: string; description?: string; ogImage?: string };
}

// ---------- Art ----------
export interface Artwork extends Publishable {
  title: string;
  year?: number | string;
  technique?: string;
  /** e.g. "120 × 90 cm" */
  dimensions?: string;
  collectionId?: string;
  images: ImageAsset[];
  /** True when a published image was altered/generated with AI (must be flagged/replaced). */
  aiAltered: boolean;
  /** Original destroyed (fire) / location unknown, etc. */
  availability?: "available" | "sold" | "private-collection" | "lost" | "unknown";
  notes?: string;
}

export interface Collection extends Publishable {
  title: string;
  statement?: string;
  cover?: ImageAsset;
  period?: string;
  artworkIds: string[];
}

export interface CatalogProject extends Publishable {
  kind: "catalog" | "project" | "exhibition";
  title: string;
  year?: number | string;
  summary?: string;
  cover?: ImageAsset;
  /** PDF or external link of the catalog. */
  fileUrl?: string;
  body: Block[];
}

// ---------- Programs (Taller del Artista) ----------
export type ProgramKind = "colaboracion" | "incubadora" | "jovenes-talentos";

export interface Program extends Publishable {
  kind: ProgramKind;
  title: string;
  /** e.g. "Jueves" for La Incubadora */
  schedule?: string;
  summary?: string;
  body: Block[];
  cover?: ImageAsset;
}

export interface Person extends Publishable {
  name: string;
  /** poeta, músico, bailarín, deportista, … */
  discipline?: string;
  programKinds: ProgramKind[];
  bio?: string;
  portrait?: ImageAsset;
  /** Featured work: a poem, a recording link, etc. */
  featured?: Block[];
  links?: { label: string; href: string }[];
}

/** A beneficiary story inside the collaboration program. */
export interface Beneficiary extends Person {
  achievement?: string;
  supportGiven?: string;
  date?: ISODate;
}

export interface Post extends Publishable {
  title: string;
  excerpt?: string;
  cover?: ImageAsset;
  body: Block[];
  publishedAt: ISODate;
  tags?: string[];
  programKind?: ProgramKind;
}

export interface SiteSettings {
  id: "site";
  siteName: string;
  tagline: string;
  email: string;
  location: string;
  social: { label: string; href: string }[];
  footerNote?: string;
  /** Bumped on every write → client cache invalidation. */
  contentVersion: string;
  updatedAt: ISODate;
}

export const COLLECTIONS = {
  pages: "pages",
  artworks: "artworks",
  collections: "collections",
  catalogs: "catalogs",
  programs: "programs",
  people: "people",
  posts: "posts",
  settings: "settings",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
