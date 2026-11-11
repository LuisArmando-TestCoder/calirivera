/**
 * Diagramación procedural de «Memoria».
 * Entrada: los recuerdos publicados (cualquier cantidad, cualquier aspecto).
 * Salida: años (1993 → hoy) y, para cada recuerdo, cuánto ocupa en una trama de 12 columnas
 * (6 en móvil), cuántas filas, y un leve desajuste estable (como fotos colgadas en una tela).
 * Es determinista: el mismo contenido da el mismo layout; agregar un recuerdo solo cambia su año.
 */
import type { Memory } from "@/lib/content/types";

export type Placed = {
  memory: Memory;
  /** columnas / filas en escritorio (12 col) y móvil (6 col) */
  c: number;
  r: number;
  cm: number;
  rm: number;
  /** desajuste en % del ancho/alto propio y rotación en grados */
  dx: number;
  dy: number;
  rot: number;
  /** recuerdo «fuerte» de su año (el que se lee primero) */
  lead: boolean;
  /** línea horizontal: alto en filas y ancho en columnas de una trama de celdas cuadradas */
  hr: number;
  hc: number;
};

export type YearBlock = { key: string; label: string; year: number | null; approx: boolean; items: Placed[] };

/** Ancho de columna / alto de fila de la trama (deben coincidir con el SCSS). */
const COL_TO_ROW = 1.2; // en escritorio, una columna ≈ 1.2 filas de alto
const COL_TO_ROW_M = 1.55;

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const rnd = (seed: number, k: number) => ((Math.imul(seed ^ (k * 0x9e3779b1), 2654435761) >>> 0) % 10000) / 10000;

export function yearOf(m: Memory): number | null {
  const y = parseInt(String(m.year ?? ""), 10);
  return Number.isFinite(y) && y > 1900 ? y : null;
}

function place(m: Memory, nInYear: number, idx: number): Placed {
  const w = m.image.width ?? 1000;
  const h = m.image.height ?? 1000;
  const aspect = Math.min(2.6, Math.max(0.38, w / h));
  const longSide = Math.max(w, h);
  const seed = hash(m.slug || m.id);
  // Densidad: un año con pocas fotos las muestra grandes; uno lleno, más chicas.
  let c = nInYear <= 2 ? 5 : nInYear <= 5 ? 4 : nInYear <= 12 ? 3 : 2;
  if (aspect > 1.35) c += 1; // apaisadas ocupan más ancho
  if (aspect > 1.9) c += 1;
  if (m.featured) c += 2;
  if (longSide < 420) c -= 1; // lo que no aguanta tamaño, más chico
  const lead = idx === 0 && nInYear > 3;
  if (lead) c += 2;
  if (longSide < 700) c = Math.min(c, 4);
  c = Math.max(2, Math.min(8, c));
  const r = Math.max(2, Math.min(c * 2, Math.round((c * COL_TO_ROW) / aspect)));
  let cm = c >= 4 ? 4 : 3;
  if (aspect > 1.25 || m.featured || lead) cm = 6;
  const rm = Math.max(2, Math.min(cm * 2, Math.round((cm * COL_TO_ROW_M) / aspect)));
  // Línea horizontal: el alto decide la jerarquía (8 filas en total); el ancho sale del aspecto real.
  let hr = nInYear <= 2 ? 6 : nInYear <= 5 ? 5 : nInYear <= 12 ? 4 : 3;
  if (lead) hr += 2;
  if (m.featured) hr += 2;
  if (longSide < 420) hr -= 1;
  if (longSide < 700) hr = Math.min(hr, 4);
  // un poco de variación estable: la línea respira, no es una grilla de catálogo
  if (!lead && rnd(seed, 4) > 0.72) hr += 1;
  hr = Math.max(2, Math.min(7, hr));
  const hc = Math.max(1, Math.min(14, Math.round(hr * aspect)));
  return {
    memory: m,
    hr,
    hc,
    c,
    r,
    cm,
    rm,
    dx: Math.round((rnd(seed, 1) - 0.5) * 8 * 10) / 10,
    dy: Math.round((rnd(seed, 2) - 0.5) * 10 * 10) / 10,
    rot: Math.round((rnd(seed, 3) - 0.5) * 2.4 * 100) / 100,
    lead,
  };
}

export function layoutMemories(memories: Memory[]): YearBlock[] {
  const byYear = new Map<string, Memory[]>();
  for (const m of memories) {
    const y = yearOf(m);
    const k = y === null ? "sin-fecha" : String(y);
    if (!byYear.has(k)) byYear.set(k, []);
    byYear.get(k)!.push(m);
  }
  const keys = [...byYear.keys()].sort((a, b) => (a === "sin-fecha" ? 1 : b === "sin-fecha" ? -1 : Number(a) - Number(b)));
  return keys.map((k) => {
    // Dentro del año: destacados primero, luego un orden estable que mezcla tipos (no todo «obra» junto)
    const ms = byYear.get(k)!.slice().sort(
      (a, b) =>
        Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
        (a.order ?? 1e9) - (b.order ?? 1e9) ||
        (b.image.width ?? 0) * (b.image.height ?? 0) - (a.image.width ?? 0) * (a.image.height ?? 0) ||
        hash(a.slug) - hash(b.slug),
    );
    const year = k === "sin-fecha" ? null : Number(k);
    return {
      key: k,
      year,
      label: year === null ? "Sin fecha" : String(year),
      approx: ms.every((m) => m.yearApprox),
      items: ms.map((m, i) => place(m, ms.length, i)),
    };
  });
}

/** srcset de las variantes que genera tools/optimize-media.mjs */
export function srcsetOf(src: string, widths: number[] | undefined, ext: "avif" | "webp" | "jpg") {
  if (!widths?.length || !/-\d+\.jpg$/.test(src)) return undefined;
  return widths.map((w) => `${src.replace(/-\d+\.jpg$/, `-${w}.${ext}`)} ${w}w`).join(", ");
}

export const KIND_LABEL: Record<string, string> = {
  obra: "Obra",
  taller: "El Taller",
  evento: "Evento",
  prensa: "Prensa",
  persona: "Persona",
  lugar: "Lugar",
  documento: "Documento",
};

export const SOURCE_LABEL: Record<string, string> = {
  "sitio-actual": "calirivera.com (sitio actual)",
  wayback: "calirivera.com, sitio viejo (Internet Archive)",
  catalogo: "Catálogo",
  cali: "Archivo de Cali",
};
