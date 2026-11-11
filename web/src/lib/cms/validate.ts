/** Turns raw form values into a clean document following a CollectionDef. Pure. */
import type { Block, ImageAsset, LayoutPreset, Section } from "@/lib/content/types";
import { BLOCK_TYPES, LAYOUT_OPTIONS, TONE_OPTIONS, type CollectionDef, type FieldDef } from "./config";
import { getAt, setAt } from "./paths";
import { slugify } from "./slug";

export type Errors = Record<string, string>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

export function isSafeUrl(href: string): boolean {
  return /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i.test(href);
}

export function cleanImage(v: unknown): ImageAsset | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const src = str(o.src);
  if (!src || !(isSafeUrl(src) || src.startsWith("data:image/"))) return undefined;
  const img: ImageAsset = { src, alt: str(o.alt).slice(0, 300) };
  if (Number.isFinite(o.width)) img.width = Number(o.width);
  if (Number.isFinite(o.height)) img.height = Number(o.height);
  if (typeof o.placeholder === "string" && o.placeholder.length < 4000) img.placeholder = o.placeholder;
  if (o.lowRes === true) img.lowRes = true;
  if (str(o.credit)) img.credit = str(o.credit).slice(0, 120);
  const focal = o.focal as { x?: unknown; y?: unknown } | undefined;
  if (focal && Number.isFinite(focal.x) && Number.isFinite(focal.y))
    (img as ImageAsset & { focal?: { x: number; y: number } }).focal = { x: clamp01(Number(focal.x)), y: clamp01(Number(focal.y)) };
  return img;
}
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const newId = (prefix = "b") => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export function cleanBlock(v: unknown, path: string, errors: Errors): Block | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id) || newId();
  const type = str(o.type);
  if (!BLOCK_TYPES.some((b) => b.value === type)) {
    errors[path] = "Tipo de bloque desconocido";
    return null;
  }
  switch (type) {
    case "heading": {
      const text = str(o.text);
      if (!text) errors[`${path}.text`] = "El título está vacío";
      const level = [1, 2, 3, 4].includes(Number(o.level)) ? (Number(o.level) as 1 | 2 | 3 | 4) : 2;
      return { type, id, level, text: text.slice(0, 200) };
    }
    case "paragraph": {
      const text = str(o.text);
      if (!text) errors[`${path}.text`] = "El párrafo está vacío";
      return { type, id, text: text.slice(0, 8000) };
    }
    case "quote": {
      const text = str(o.text);
      if (!text) errors[`${path}.text`] = "La cita está vacía";
      return { type, id, text: text.slice(0, 2000), ...(str(o.cite) ? { cite: str(o.cite).slice(0, 160) } : {}) };
    }
    case "poem": {
      const lines = Array.isArray(o.lines) ? o.lines.map((l) => String(l ?? "")) : str(o.text).split("\n");
      const trimmed = lines.map((l) => l.replace(/\s+$/, "")).slice(0, 400);
      while (trimmed.length && !trimmed[trimmed.length - 1]) trimmed.pop();
      if (!trimmed.some(Boolean)) errors[`${path}.lines`] = "El poema está vacío";
      return {
        type,
        id,
        lines: trimmed,
        ...(str(o.title) ? { title: str(o.title).slice(0, 160) } : {}),
        ...(str(o.author) ? { author: str(o.author).slice(0, 120) } : {}),
      };
    }
    case "video": {
      // solo enlaces a reproductores que se pueden incrustar (el sitio no aloja archivos de video)
      const url = str(o.url);
      if (!/^https:\/\/((www\.|m\.)?youtube\.com\/|youtu\.be\/|(www\.|player\.)?vimeo\.com\/)/.test(url)) errors[`${path}.url`] = "Pegá el enlace de YouTube o Vimeo (empieza con https://)";
      return { type, id, url: url.slice(0, 300), ...(str(o.title) ? { title: str(o.title).slice(0, 160) } : {}) } as unknown as Block;
    }
    case "image": {
      const image = cleanImage(o.image);
      if (!image) {
        errors[`${path}.image`] = "Falta la foto";
        return null;
      }
      return { type, id, image, ...(str(o.caption) ? { caption: str(o.caption).slice(0, 300) } : {}) };
    }
    case "gallery": {
      const images = (Array.isArray(o.images) ? o.images : []).map(cleanImage).filter(Boolean) as ImageAsset[];
      if (!images.length) errors[`${path}.images`] = "La galería no tiene fotos";
      return { type, id, images, ...(str(o.caption) ? { caption: str(o.caption).slice(0, 300) } : {}) };
    }
  }
  return null;
}

function cleanBlocks(v: unknown, path: string, errors: Errors): Block[] {
  return (Array.isArray(v) ? v : []).map((b, i) => cleanBlock(b, `${path}.${i}`, errors)).filter(Boolean) as Block[];
}

function cleanSections(v: unknown, path: string, errors: Errors): Section[] {
  return (Array.isArray(v) ? v : []).map((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const layout = (LAYOUT_OPTIONS.some((l) => l.value === o.layout) ? o.layout : "auto") as LayoutPreset;
    const tone = TONE_OPTIONS.some((t) => t.value === o.tone) ? (o.tone as Section["tone"]) : undefined;
    return {
      id: str(o.id) || newId("s"),
      ...(str(o.title) ? { title: str(o.title).slice(0, 160) } : {}),
      layout,
      ...(tone ? { tone } : {}),
      ...(o.marks === true ? { marks: true } : {}),
      blocks: cleanBlocks(o.blocks, `${path}.${i}.blocks`, errors),
    };
  });
}

function cleanField(f: FieldDef, raw: unknown, errors: Errors, optionValues?: string[]): unknown {
  const req = (empty: boolean) => {
    if (f.required && empty) errors[f.name] = `${f.label}: es obligatorio`;
  };
  switch (f.type) {
    case "text":
    case "textarea": {
      const s = str(raw);
      req(!s);
      if (f.max && s.length > f.max) errors[f.name] = `${f.label}: máximo ${f.max} caracteres (tiene ${s.length})`;
      return s || undefined;
    }
    case "url": {
      const s = str(raw);
      req(!s);
      if (s && !isSafeUrl(s)) errors[f.name] = `${f.label}: debe empezar con https://`;
      return s || undefined;
    }
    case "slug": {
      const s = slugify(str(raw));
      return s || undefined;
    }
    case "number": {
      if (raw === "" || raw == null) return req(true), undefined;
      const n = Number(raw);
      if (!Number.isFinite(n)) errors[f.name] = `${f.label}: debe ser un número`;
      return Number.isFinite(n) ? n : undefined;
    }
    case "date": {
      const s = str(raw);
      req(!s);
      if (!s) return undefined;
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
      if (!m) {
        errors[f.name] = `${f.label}: fecha inválida`;
        return undefined;
      }
      // Noon in Costa Rica (UTC-6) so the day never shifts.
      return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00-06:00`).toISOString();
    }
    case "select": {
      const s = str(raw);
      const allowed = optionValues ?? f.options?.map((o) => o.value) ?? [];
      if (s && !allowed.includes(s)) errors[f.name] = `${f.label}: opción inválida`;
      req(!s);
      return s || undefined;
    }
    case "multiselect": {
      const arr = (Array.isArray(raw) ? raw : str(raw) ? [raw] : []).map(str).filter(Boolean);
      const allowed = f.options?.map((o) => o.value) ?? [];
      const ok = arr.filter((v) => allowed.includes(v));
      req(!ok.length);
      return ok;
    }
    case "boolean":
      return raw === true || raw === "true" || raw === "on";
    case "image": {
      const img = cleanImage(raw);
      req(!img);
      return img;
    }
    case "images": {
      const imgs = (Array.isArray(raw) ? raw : []).map(cleanImage).filter(Boolean);
      req(!imgs.length);
      return imgs;
    }
    case "blocks":
      return cleanBlocks(raw, f.name, errors);
    case "sections":
      return cleanSections(raw, f.name, errors);
    case "links": {
      const arr = (Array.isArray(raw) ? raw : []).map((l, i) => {
        const o = (l ?? {}) as Record<string, unknown>;
        const label = str(o.label).slice(0, 80);
        const href = str(o.href);
        if ((label || href) && !isSafeUrl(href)) errors[`${f.name}.${i}`] = "Enlace inválido (debe empezar con https://)";
        return label || href ? { label: label || href, href } : null;
      });
      return arr.filter(Boolean);
    }
    case "tags": {
      const arr = (Array.isArray(raw) ? raw : str(raw).split(",")).map(str).filter(Boolean).slice(0, 20);
      return arr.map((t) => t.slice(0, 40));
    }
  }
}

/**
 * @param raw   values keyed by field name (dot paths) or a nested object
 * @param dynamicOptions  values allowed for `optionsFrom` selects
 */
export function validateDoc(def: CollectionDef, raw: Record<string, unknown>, dynamicOptions: Record<string, string[]> = {}) {
  const errors: Errors = {};
  let value: Record<string, unknown> = {};
  for (const f of def.fields) {
    const input = f.name in raw ? raw[f.name] : getAt(raw, f.name.split("."));
    const v = cleanField(f, input, errors, f.optionsFrom ? ["", ...(dynamicOptions[f.name] ?? [])] : undefined);
    if (v !== undefined) value = setAt(value, f.name.split("."), v);
  }
  return { value, errors, ok: Object.keys(errors).length === 0 };
}
