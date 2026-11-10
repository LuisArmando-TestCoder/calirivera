const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

/** "2016-03-01T…" → "marzo 2016" (fecha de la agenda; el día no siempre es real). */
export function formatMonth(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatYear(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : String(d.getUTCFullYear());
}

/** Normaliza para búsqueda: minúsculas, sin tildes. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
