/**
 * Lo que el editor guarda en ESTE dispositivo (localStorage), para que nada se pierda si se apaga el teléfono:
 *  - borradores: los cambios sin publicar de cada página, guardados solos en cada cambio
 *  - envíos («en camino»): lo que ya se publicó pero el sitio todavía está reconstruyendo. Mientras tanto se
 *    vuelve a dibujar encima de la página para que Cali vea su cambio, y se sigue su estado hasta «en línea».
 */
import type { InlineOp } from "@/lib/cms/ops";

export type SendState = "sent" | "building" | "live" | "failed";
export type Sending = {
  commit: string;
  pathname: string;
  label: string;
  ops: InlineOp[];
  at: number;
  state: SendState;
  liveAt?: number;
  /** ids reales de lo que se creó (provisorio → real) */
  created?: Record<string, string>;
  /** adónde ir cuando esté en línea (página nueva) */
  href?: string;
};
export type LocalDraft = { pathname: string; ops: InlineOp[]; savedAt: number };

const DRAFT = "cr-cms:borrador:";
const OUTBOX = "cr-cms:envios";
export const CHANGE = "cms:local";

const read = <T,>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // sin espacio o modo privado: el editor sigue, solo que sin red de seguridad
  }
  window.dispatchEvent(new Event(CHANGE));
};

export const saveDraft = (pathname: string, ops: InlineOp[]) => write(DRAFT + pathname, ops.length ? { pathname, ops, savedAt: Date.now() } : null);
export const loadDraft = (pathname: string) => read<LocalDraft | null>(DRAFT + pathname, null);
export function allDrafts(): LocalDraft[] {
  const out: LocalDraft[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(DRAFT)) continue;
      const d = read<LocalDraft | null>(k, null);
      if (d?.ops?.length) out.push(d);
    }
  } catch {}
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export const outbox = () => read<Sending[]>(OUTBOX, []);
export function addSending(s: Omit<Sending, "at" | "state">) {
  write(OUTBOX, [{ ...s, at: Date.now(), state: "sent" as const }, ...outbox()].slice(0, 30));
}
export function setStates(states: Record<string, SendState>) {
  const cur = outbox();
  let changed = false;
  const next = cur.map((s) => {
    const st = states[s.commit];
    if (!st || st === s.state) return s;
    changed = true;
    return { ...s, state: st, ...(st === "live" ? { liveAt: Date.now() } : {}) };
  });
  // lo que ya está en línea se recuerda un día (para el «listo» de la lista) y después se olvida
  const kept = next.filter((s) => s.state !== "live" || Date.now() - (s.liveAt ?? s.at) < 864e5);
  if (changed || kept.length !== cur.length) write(OUTBOX, kept);
  return kept;
}
export const dismissSending = (commit: string) => write(OUTBOX, outbox().filter((s) => s.commit !== commit));
/** Para acciones del panel (/admin): anotar la publicación para seguirla desde cualquier página. */
export function noteCommit(r: { commit?: string | null; deploys?: boolean } | null | undefined, label: string) {
  if (r?.commit && r.deploys) addSending({ commit: r.commit, pathname: "", label, ops: [] });
}
