/**
 * Lo que el fuego está haciendo AHORA, para quien quiera oírlo. Cada superficie que arde (el escenario del
 * inicio, la trama de Memoria, una ficha) informa su estado en cada cuadro que simula; el sonido lo lee.
 * Si una superficie deja de informar (salió de pantalla, se pausó, se quedó quieta) su fuego se apaga solo:
 * así el sonido existe únicamente donde y cuando el fuego se ve.
 */
export type Fire = {
  /** calor presente (0..1): cuánto arde */
  heat: number;
  /** velocidad del aire que mueve la antorcha (0..1) */
  flow: number;
  /** cuánto se está enroscando (0..1): cambios de dirección, remolinos */
  swirl: number;
  /** dónde está, de izquierda (-1) a derecha (1) */
  pan: number;
};
const sources = new Map<string, Fire & { t: number }>();

export function reportFire(id: string, f: Fire) {
  sources.set(id, { ...f, t: performance.now() });
}
export function clearFire(id: string) {
  sources.delete(id);
}
/** La suma de lo que arde en este instante (lo viejo se desvanece en medio segundo). */
export function fireNow(): Fire {
  const now = performance.now();
  const out: Fire = { heat: 0, flow: 0, swirl: 0, pan: 0 };
  let w = 0;
  for (const [id, s] of sources) {
    const age = now - s.t;
    if (age > 1500) {
      sources.delete(id);
      continue;
    }
    const k = age < 180 ? 1 : Math.exp(-(age - 180) / 320);
    out.heat = Math.max(out.heat, s.heat * k);
    out.flow = Math.max(out.flow, age < 180 ? s.flow : 0);
    out.swirl = Math.max(out.swirl, age < 180 ? s.swirl : 0);
    out.pan += s.pan * s.heat * k;
    w += s.heat * k;
  }
  out.pan = w > 0.001 ? out.pan / w : 0;
  return out;
}
