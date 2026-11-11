/**
 * Marcas de lectura para los textos autobiográficos: fechas, lugares y obras.
 * No cambia el texto (solo lo parte en trozos): el CMS sigue editando el mismo string.
 * Diccionarios curados a partir del propio contenido; el más largo gana cuando dos se pisan.
 */
export type Mark = { kind: "text" | "date" | "place" | "work"; value: string };

const MONTHS = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";
const DATE = new RegExp(
  [
    `\\b\\d{1,2} de (?:${MONTHS})(?: de \\d{4})?`,
    `\\b(?:${MONTHS}) de \\d{4}`,
    `\\bdécada de \\d{4}`,
    `\\bentre \\d{4} y \\d{4}`,
    `\\baños (?:90|noventa|80|ochenta)`,
    `\\b(?:19|20)\\d{2}\\b`,
  ].join("|"),
  "gi",
);

export const PLACES = [
  "Museo Central de Arte Textil de Łódź",
  "Museo Central de Arte Textil",
  "Museo Central de Polonia",
  "Museo Municipal de Cartago",
  "Museo de los Niños",
  "Teatro Nacional de Costa Rica",
  "Teatro Nacional",
  "Galería Nacional",
  "Universidad Latina de Costa Rica",
  "Universidad Tricentenaria de Guatemala",
  "Collegium Veritas",
  "Trienal Internacional de Riga",
  "Trienal de Riga",
  "Parque de la Paz",
  "San Pedro La Laguna",
  "lago Atitlán",
  "Lago Atitlán",
  "La Unión de Cartago",
  "Tres Ríos",
  "San José",
  "Costa Rica",
  "Cartago",
  "Guatemala",
  "Nicaragua",
  "Francia",
  "París",
  "Japón",
  "Polonia",
  "Łódź",
  "Letonia",
  "Riga",
  "Luxemburgo",
  "Berlín",
  "Los Ángeles",
  "Estados Unidos",
  "Europa",
  "Asia",
];

export const WORKS = [
  "Sincretismo Religioso: un camino para la Paz",
  "Sincretismo religioso, un camino para la paz",
  "Las Banderas del Corpus Christi",
  "Banderas de Globalización",
  "La Cruz de San Pedro",
  "Canto a la Libertad",
  "Detrás de la Ventana",
  "Detrás de la ventana",
  "Musas del Cántaro",
  "Sueños en Azul",
  "Alquimia de Almas",
  "Misa Solemne de Mozart",
  "Carta a los artistas",
  "Carta de la Tierra",
  "CUD – MILAGRO",
  "Duro de matar 2",
  "Lambada, el baile prohibido",
  "La Cofradía",
  "Atmósfera",
  "Ave Fénix",
  "Plegaria",
  "Poetry",
  "Exvotos",
  "Biomaster",
  "Prayer Flags",
  "Milagro",
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const dict = (list: string[], kind: Mark["kind"]) => ({
  kind,
  re: new RegExp(`(?<![\\p{L}])(?:${[...list].sort((a, b) => b.length - a.length).map(esc).join("|")})(?![\\p{L}])`, "gu"),
});
const SOURCES = [dict(WORKS, "work"), dict(PLACES, "place"), { kind: "date" as const, re: DATE }];

export function marksOf(text: string): Mark[] {
  type Hit = { a: number; b: number; kind: Mark["kind"] };
  const hits: Hit[] = [];
  for (const { kind, re } of SOURCES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) hits.push({ a: m.index!, b: m.index! + m[0].length, kind });
  }
  // el más largo gana; después, el que empieza antes
  hits.sort((x, y) => y.b - y.a - (x.b - x.a) || x.a - y.a);
  const taken: Hit[] = [];
  for (const h of hits) if (!taken.some((t) => h.a < t.b && t.a < h.b)) taken.push(h);
  taken.sort((x, y) => x.a - y.a);
  const out: Mark[] = [];
  let i = 0;
  for (const h of taken) {
    if (h.a > i) out.push({ kind: "text", value: text.slice(i, h.a) });
    out.push({ kind: h.kind, value: text.slice(h.a, h.b) });
    i = h.b;
  }
  if (i < text.length) out.push({ kind: "text", value: text.slice(i) });
  return out;
}

/** Ancla de un segmento: la primera fecha que aparece (para la columna de la izquierda). */
export function anchorOf(text: string): string | null {
  const m = marksOf(text).find((x) => x.kind === "date");
  if (!m) return null;
  const y = m.value.match(/(?:19|20)\d{2}/g);
  if (/^entre/i.test(m.value) && y?.length === 2) return `${y[0]}–${y[1].slice(2)}`;
  if (/^años/i.test(m.value)) return "Años 90";
  return y ? y[0] : null;
}

/** Lugares y obras de un segmento, sin repetir (para la esquina de abajo a la derecha). */
export function factsOf(text: string) {
  const ms = marksOf(text);
  const uniq = (k: Mark["kind"]) => [...new Set(ms.filter((m) => m.kind === k).map((m) => m.value))];
  return { places: uniq("place"), works: uniq("work") };
}
