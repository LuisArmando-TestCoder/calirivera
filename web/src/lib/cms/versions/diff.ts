/**
 * Qué cambió entre dos versiones de un documento, dicho en palabras de todos los días:
 * «Sección 2 · Párrafo: …texto viejo… → …texto nuevo…», «Portada · Foto: (antes) → (después)».
 * Puro (sin red ni servidor): lo usan el historial de versiones y sus pruebas.
 */

export type Seg = { t: "same" | "del" | "add"; s: string };

export type Change =
  | { kind: "text"; label: string; before: string; after: string; segs: Seg[] }
  | { kind: "image"; label: string; before: string | null; after: string | null }
  | { kind: "added" | "removed"; label: string; preview: string; image?: string | null }
  | { kind: "state"; label: string; before: string; after: string };

/** Lo que no cuenta como «cambio» para una persona: sellos de tiempo e internos. */
const SKIP = new Set(["updatedAt", "createdAt", "contentVersion", "id", "slug", "marks", "trashedAt", "prevStatus", "widths", "width", "height", "blurDataURL", "lqip", "hr", "hc"]);

const FIELD: Record<string, string> = {
  title: "Título",
  subtitle: "Subtítulo",
  hero: "Portada",
  text: "Texto",
  caption: "Pie de foto",
  alt: "Descripción de la foto",
  tagline: "Lema",
  email: "Correo",
  address: "Dirección",
  whatsapp: "WhatsApp",
  hours: "Horario",
  days: "Días",
  time: "Hora",
  cta: "Botón",
  label: "Texto del botón",
  href: "Enlace",
  url: "Enlace",
  statement: "Texto de la colección",
  period: "Período",
  year: "Año",
  technique: "Técnica",
  dimensions: "Medidas",
  excerpt: "Resumen",
  body: "Contenido",
  status: "Estado",
  trashed: "Papelera",
  archived: "Archivo",
  image: "Foto",
  cover: "Portada",
  images: "Fotos",
  name: "Nombre",
  bio: "Biografía",
  place: "Lugar",
  people: "Personas",
  description: "Descripción",
  summary: "Resumen",
  footerNote: "Nota del pie",
  siteName: "Nombre del sitio",
  location: "Ubicación",
  social: "Redes",
  menu: "Menú",
  order: "Orden",
  layout: "Diseño",
  tone: "Color",
  lines: "Versos",
  author: "Autor",
  outlet: "Medio",
  publishedAt: "Fecha",
  dateLabel: "Fecha",
  tags: "Etiquetas",
  sections: "Secciones",
  blocks: "Bloques",
  featured: "Destacados",
  mapUrl: "Mapa",
  pdf: "PDF",
  video: "Video",
};
const BLOCK: Record<string, string> = {
  paragraph: "Párrafo",
  heading: "Título",
  quote: "Cita",
  image: "Foto",
  gallery: "Galería",
  video: "Video",
  poem: "Poema",
  list: "Lista",
  embed: "Video",
  pdf: "PDF",
  button: "Botón",
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isImage = (v: unknown): v is { src: string } => isObj(v) && typeof v.src === "string";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** El texto más representativo de un objeto (para mostrar qué se agregó o quitó). */
export function previewOf(v: unknown, max = 140): string {
  if (typeof v === "string") return v.length > max ? v.slice(0, max - 1) + "…" : v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    for (const x of v) {
      const p = previewOf(x, max);
      if (p) return p;
    }
    return "";
  }
  if (isObj(v)) {
    for (const k of ["title", "text", "name", "caption", "label", "alt", "subtitle", "statement", "excerpt", "lines", "blocks", "items"]) {
      const p = previewOf(v[k], max);
      if (p) return p;
    }
  }
  return "";
}
const imageOf = (v: unknown): string | null => (isImage(v) ? v.src : isObj(v) && isImage(v.image) ? v.image.src : null);

/** Nombre de una posición dentro del documento: «Sección 2 · Párrafo · Texto». */
function labelOf(path: (string | number)[], root: unknown): string {
  const parts: string[] = [];
  let node: unknown = root;
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    const next = Array.isArray(node) || isObj(node) ? (node as Record<string | number, unknown>)[key] : undefined;
    if (typeof key === "number") {
      const parent = path[i - 1];
      if (parent === "sections") parts.push(`Sección ${key + 1}`);
      else if (parent === "blocks" || parent === "body" || parent === "featured") {
        const type = isObj(next) ? String(next.type ?? "") : "";
        parts.push(BLOCK[type] ?? `Bloque ${key + 1}`);
      } else if (parent === "lines") parts.push(`verso ${key + 1}`);
      else parts.push(`n.º ${key + 1}`);
    } else if (key !== "sections" && key !== "blocks" && key !== "body") {
      // «Texto» de un párrafo es redundante: el bloque ya dice qué es
      const prevBlock = typeof path[i - 1] === "number" && (path[i - 2] === "blocks" || path[i - 2] === "body");
      if (!(prevBlock && (key === "text" || key === "image"))) parts.push(FIELD[key] ?? cap(key));
    }
    node = next;
  }
  return parts.join(" · ") || "Página";
}

/** Diferencia palabra por palabra (para resaltar lo que cambió dentro de un texto largo). */
export function wordDiff(a: string, b: string): Seg[] {
  const A = a.match(/\s+|[^\s]+/g) ?? [];
  const B = b.match(/\s+|[^\s]+/g) ?? [];
  // recortar lo igual al principio y al final: los textos suelen cambiar en un solo lugar
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const a2 = A.slice(pre, A.length - suf);
  const b2 = B.slice(pre, B.length - suf);
  const mid: Seg[] = [];
  if (a2.length * b2.length > 250_000) {
    if (a2.length) mid.push({ t: "del", s: a2.join("") });
    if (b2.length) mid.push({ t: "add", s: b2.join("") });
  } else {
    const n = a2.length;
    const m = b2.length;
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a2[i] === b2[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a2[i] === b2[j]) {
        mid.push({ t: "same", s: a2[i++] });
        j++;
      }
      // lo quitado antes que lo agregado: se lee «antes → después»
      else if (i < n && (j >= m || L[i + 1][j] >= L[i][j + 1])) mid.push({ t: "del", s: a2[i++] });
      else mid.push({ t: "add", s: b2[j++] });
    }
  }
  const out: Seg[] = [];
  const push = (s: Seg) => {
    if (!s.s) return;
    const last = out[out.length - 1];
    if (last && last.t === s.t) last.s += s.s;
    else out.push({ ...s });
  };
  push({ t: "same", s: A.slice(0, pre).join("") });
  mid.forEach(push);
  push({ t: "same", s: A.slice(A.length - suf).join("") });
  return out;
}

/** Recorta lo que no cambió en textos largos: «…unas palabras antes [cambio] unas después…». */
export function trimSegs(segs: Seg[], context = 60): Seg[] {
  return segs.map((s, i) => {
    if (s.t !== "same" || s.s.length <= context * 2) return s;
    const first = i === 0;
    const last = i === segs.length - 1;
    if (first) return { t: "same", s: "…" + s.s.slice(-context).replace(/^\S*\s/, "") };
    if (last) return { t: "same", s: s.s.slice(0, context).replace(/\s\S*$/, "") + "…" };
    return { t: "same", s: s.s.slice(0, context).replace(/\s\S*$/, "") + " … " + s.s.slice(-context).replace(/^\S*\s/, "") };
  });
}

const STATE_WORDS: Record<string, Record<string, string>> = {
  status: { published: "Publicado", draft: "Oculto (borrador)" },
  trashed: { true: "En la papelera", false: "Fuera de la papelera" },
  archived: { true: "Archivado", false: "Visible" },
};

/** Todo lo que cambió de `before` a `after`, en orden de lectura. */
export function diffDocs(before: unknown, after: unknown, max = 60): Change[] {
  const out: Change[] = [];
  const walk = (a: unknown, b: unknown, path: (string | number)[]) => {
    if (out.length >= max) return;
    const key = path[path.length - 1];
    if (typeof key === "string" && SKIP.has(key)) return;
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    const label = () => (b === undefined || b === null ? labelOf(path, before) : labelOf(path, after));
    if (isImage(a) || isImage(b)) {
      if (isImage(a) && isImage(b) && a.src === b.src) {
        // la misma foto: puede haber cambiado su descripción o pie
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (k !== "src") walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], [...path, k]);
        return;
      }
      out.push({ kind: "image", label: label(), before: isImage(a) ? a.src : null, after: isImage(b) ? b.src : null });
      return;
    }
    if (typeof key === "string" && STATE_WORDS[key] && (typeof a !== "object" || a === null) && (typeof b !== "object" || b === null)) {
      const w = STATE_WORDS[key];
      out.push({ kind: "state", label: FIELD[key] ?? key, before: w[String(a ?? false)] ?? String(a ?? "—"), after: w[String(b ?? false)] ?? String(b ?? "—") });
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      // listas con id (bloques, secciones): emparejar por id, así mover o insertar no parece «todo cambió»
      const ids = (xs: unknown[]) => xs.map((x) => (isObj(x) && typeof x.id === "string" ? x.id : null));
      const ia = ids(a);
      const ib = ids(b);
      if (ia.every(Boolean) && ib.every(Boolean)) {
        const bIndex = new Map(ib.map((id, i) => [id, i]));
        const aIndex = new Map(ia.map((id, i) => [id, i]));
        a.forEach((x, i) => {
          if (!bIndex.has(ia[i])) out.push({ kind: "removed", label: labelOfIn(before, [...path, i]), preview: previewOf(x), image: imageOf(x) });
        });
        b.forEach((x, j) => {
          const i = aIndex.get(ib[j]);
          if (i === undefined) out.push({ kind: "added", label: labelAt([...path, j]), preview: previewOf(x), image: imageOf(x) });
          else walk(a[i], x, [...path, j]);
        });
        return;
      }
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) {
        if (i >= a.length) out.push({ kind: "added", label: labelAt([...path, i]), preview: previewOf(b[i]), image: imageOf(b[i]) });
        else if (i >= b.length) out.push({ kind: "removed", label: labelOfIn(before, [...path, i]), preview: previewOf(a[i]), image: imageOf(a[i]) });
        else walk(a[i], b[i], [...path, i]);
      }
      return;
    }
    if (isObj(a) && isObj(b)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], [...path, k]);
      return;
    }
    if (a === undefined || a === null || a === "") {
      if (typeof b === "string" || typeof b === "number") out.push({ kind: "text", label: label(), before: "", after: String(b), segs: [{ t: "add", s: String(b) }] });
      else out.push({ kind: "added", label: label(), preview: previewOf(b), image: imageOf(b) });
      return;
    }
    if (b === undefined || b === null || b === "") {
      if (typeof a === "string" || typeof a === "number") out.push({ kind: "text", label: labelOfIn(before, path), before: String(a), after: "", segs: [{ t: "del", s: String(a) }] });
      else out.push({ kind: "removed", label: labelOfIn(before, path), preview: previewOf(a), image: imageOf(a) });
      return;
    }
    const sa = typeof a === "object" ? previewOf(a) : String(a);
    const sb = typeof b === "object" ? previewOf(b) : String(b);
    out.push({ kind: "text", label: label(), before: sa, after: sb, segs: trimSegs(wordDiff(sa, sb)) });
  };
  const labelAt = (p: (string | number)[]) => labelOf(p, after);
  const labelOfIn = (doc: unknown, p: (string | number)[]) => labelOf(p, doc);
  walk(before, after, []);
  return out;
}

/** «2 textos y 1 foto», «una sección nueva», etc. */
export function summarize(changes: Change[]): string {
  if (!changes.length) return "Sin cambios visibles";
  const n = { text: 0, image: 0, added: 0, removed: 0, state: 0 };
  for (const c of changes) n[c.kind]++;
  const parts: string[] = [];
  const p = (k: number, one: string, many: string) => k && parts.push(k === 1 ? `1 ${one}` : `${k} ${many}`);
  p(n.text, "texto", "textos");
  p(n.image, "foto", "fotos");
  p(n.added, "cosa nueva", "cosas nuevas");
  p(n.removed, "cosa quitada", "cosas quitadas");
  const state = changes.find((c) => c.kind === "state");
  if (state && state.kind === "state") parts.push(state.after.toLowerCase());
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(", ") + " y " + parts[parts.length - 1];
}
