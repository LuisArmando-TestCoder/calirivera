import type { ImageAsset } from "./types";

/** Una vista de una obra con varias fotos: su nombre («Frente», «Reverso», «Detalle 2») y una miniatura. */
export interface Face {
  label: string;
  thumb: string;
}

/** El último paréntesis antes de la raya: «Título (reverso) — Serie, año». */
const NAMED = /\(\s*([^()]{3,24}?)\s*\)\s*(?:—|$)/;
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

/**
 * El nombre de cada vista sale del texto alternativo de su foto, que ya lo dice entre paréntesis.
 * Sin paréntesis, la primera es «Obra» y las demás «Vista N»; los nombres repetidos se numeran.
 */
export function faceLabels(images: ImageAsset[]): string[] {
  const names = images.map((image, i) => {
    const named = image.alt.match(NAMED);
    return named ? capitalize(named[1]) : i === 0 ? "Obra" : `Vista ${i + 1}`;
  });
  const total = new Map<string, number>();
  for (const name of names) total.set(name, (total.get(name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return names.map((name) => {
    if (total.get(name) === 1) return name;
    const nth = (seen.get(name) ?? 0) + 1;
    seen.set(name, nth);
    return `${name} ${nth}`;
  });
}

/** La variante más liviana de una foto, para miniaturas. */
export function smallestVariant(image: ImageAsset): string {
  const narrowest = image.widths?.length ? Math.min(...image.widths) : null;
  return narrowest && /-\d+\.jpg$/.test(image.src) ? image.src.replace(/-\d+\.jpg$/, `-${narrowest}.webp`) : image.src;
}

export function facesOf(images: ImageAsset[]): Face[] {
  const labels = faceLabels(images);
  return images.map((image, i) => ({ label: labels[i], thumb: smallestVariant(image) }));
}
