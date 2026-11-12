"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { restoreVersionAction, versionsAction } from "@/app/admin/actions";
import type { Change, Seg } from "@/lib/cms/versions/diff";
import type { Scope, Version, VersionDoc } from "@/lib/cms/versions";
import v from "./versions.module.scss";

/**
 * Versiones: la lista de todo lo que se publicó, con qué cambió en cada vez, y un botón para volver.
 * Pensado para alguien que no es técnico: cada versión se lee como una frase («Cali cambió 2 textos en
 * Inicio»), lo que cambió se ve tachado y resaltado, y volver atrás pide una sola confirmación que explica
 * que no se pierde nada.
 */

type Restored = { ok: true; commit?: string | null; deploys?: boolean } | { ok: false; error: string };
type Props = {
  /** el documento principal de la página donde se abrió (para el filtro «Esta página») */
  here?: { collection: string; id: string; label: string } | null;
  onRestored?: (r: Restored, label: string) => void;
  /** dentro de una hoja (fondo claro) o en una página del Panel (fondo crema) */
  onPage?: boolean;
};

const TZ = "America/Costa_Rica";
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, dateStyle: "short" }).format(new Date(iso));
function dayLabel(iso: string) {
  const k = dayKey(iso);
  const now = Date.now();
  if (k === dayKey(new Date(now).toISOString())) return "Hoy";
  if (k === dayKey(new Date(now - 864e5).toISOString())) return "Ayer";
  const d = new Date(iso);
  const sameYear = new Intl.DateTimeFormat("es-CR", { timeZone: TZ, year: "numeric" }).format(d) === new Intl.DateTimeFormat("es-CR", { timeZone: TZ, year: "numeric" }).format(new Date());
  return new Intl.DateTimeFormat("es-CR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) }).format(d);
}
const timeLabel = (iso: string) => new Intl.DateTimeFormat("es-CR", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const whenLabel = (iso: string) => `${dayLabel(iso).toLowerCase()} a las ${timeLabel(iso)}`;

function sentence(ver: Version) {
  const titles = ver.docs.map((d) => `«${d.title}»`);
  const what = titles.length <= 2 ? titles.join(" y ") : `${titles.slice(0, 2).join(", ")} y ${titles.length - 2} más`;
  const extra = ver.moreDocs ? `${what ? " y " : ""}${ver.moreDocs} cosa${ver.moreDocs === 1 ? "" : "s"} más` : "";
  if (ver.by === "code") return `Cambio técnico${what || extra ? ` en ${what}${extra}` : ""}`;
  return ver.who ? `${ver.who} publicó ${what}${extra}` : `Se publicó ${what}${extra}`;
}

export function Versions({ here, onRestored, onPage }: Props) {
  const [scope, setScope] = useState<"here" | "all">(here ? "here" : "all");
  const [items, setItems] = useState<Version[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "more" | "error">("loading");
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (cursor: string | null) => {
      const my = ++seq.current;
      setState(cursor ? "more" : "loading");
      const sc: Scope = scope === "here" && here ? { collection: here.collection, id: here.id } : null;
      const r = await versionsAction(sc, cursor).catch(() => ({ ok: false as const, error: "No pude conectar con el servidor." }));
      if (my !== seq.current) return;
      if (!r.ok) {
        setError(r.error);
        setState("error");
        return;
      }
      setItems((cur) => (cursor ? [...cur, ...r.items] : r.items));
      if (!cursor) setOpen(null);
      setNext(r.next);
      setState("ready");
    },
    [scope, here],
  );

  // al cambiar el filtro se vuelve a cargar (la lista anterior se reemplaza cuando llega la nueva)
  useEffect(() => {
    const t = setTimeout(() => void load(null), 0);
    return () => clearTimeout(t);
  }, [load]);

  // agrupado por día, como un diario
  const groups: { day: string; items: Version[] }[] = [];
  for (const it of items) {
    const day = dayLabel(it.at);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(it);
    else groups.push({ day, items: [it] });
  }

  return (
    <div className={v.root} data-on-page={onPage ? "" : undefined}>
      <p className={v.promise}>
        <span aria-hidden className={v.promiseIcon}>
          ↺
        </span>
        <span>
          Cada vez que publicás, el sitio guarda una versión. <strong>Volver atrás nunca borra nada</strong>: lo que hay ahora también queda guardado, así que siempre se puede deshacer.
        </span>
      </p>

      {here && (
        <div className={v.tabs} role="tablist" aria-label="Qué versiones ver">
          <button type="button" role="tab" aria-selected={scope === "here"} className={v.tab} onClick={() => setScope("here")}>
            {here.label}
          </button>
          <button type="button" role="tab" aria-selected={scope === "all"} className={v.tab} onClick={() => setScope("all")}>
            Todo el sitio
          </button>
        </div>
      )}

      {state === "loading" && (
        <ul className={v.list} aria-busy="true" aria-label="Cargando versiones">
          {[0, 1, 2].map((i) => (
            <li key={i} className={v.skeleton} style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </ul>
      )}

      {state === "error" && (
        <div className={v.error} role="alert">
          <p>{error || "No se pudieron cargar las versiones."}</p>
          <button type="button" className={v.btn} onClick={() => load(null)}>
            Reintentar
          </button>
        </div>
      )}

      {state !== "loading" && state !== "error" && !items.length && (
        <p className={v.empty}>{scope === "here" ? "Esta página todavía no tiene versiones publicadas. Aparecen acá cada vez que publicás." : "Todavía no hay publicaciones."}</p>
      )}

      {groups.map((g) => (
        <section key={g.day} className={v.day} aria-label={g.day}>
          <h3 className={v.dayHead}>{g.day}</h3>
          <ol className={v.list}>
            {g.items.map((it) => (
              <VersionItem
                key={it.id}
                ver={it}
                latest={it.id === items[0]?.id}
                open={open === it.id}
                onToggle={() => setOpen((o) => (o === it.id ? null : it.id))}
                onRestored={(r, label) => {
                  onRestored?.(r, label);
                  if (r.ok) setTimeout(() => load(null), r.deploys ? 2500 : 600);
                }}
              />
            ))}
          </ol>
        </section>
      ))}

      {next && state !== "loading" && state !== "error" && (
        <button type="button" className={v.more} onClick={() => load(next)} disabled={state === "more"}>
          {state === "more" ? "Cargando…" : "Ver versiones más viejas"}
        </button>
      )}
    </div>
  );
}

function VersionItem({ ver, latest, open, onToggle, onRestored }: { ver: Version; latest: boolean; open: boolean; onToggle: () => void; onRestored: (r: Restored, label: string) => void }) {
  const id = useId();
  const [ask, setAsk] = useState<null | { mode: "this" | "undo"; only?: VersionDoc }>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { ok: boolean; text: string }>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ask) confirmRef.current?.focus();
  }, [ask]);

  const names = (ask?.only ? [ask.only] : ver.docs).map((d) => `«${d.title}»`).join(", ") || "lo que cambió";
  async function run() {
    if (!ask) return;
    setBusy(true);
    const r = (await restoreVersionAction(ver.id, ask.mode, ask.only ? { collection: ask.only.collection, id: ask.only.id } : undefined).catch(() => ({
      ok: false as const,
      error: "No pude conectar con el servidor. Probá de nuevo.",
    }))) as Restored;
    setBusy(false);
    setAsk(null);
    const label = ask.mode === "this" ? `versión de ${whenLabel(ver.at)}` : `deshacer la publicación de ${whenLabel(ver.at)}`;
    if (r.ok)
      setDone({
        ok: true,
        text: r.deploys ? "Listo. En unos minutos el sitio muestra esta versión; te aviso cuando esté en línea." : "Listo. La página ya muestra esta versión.",
      });
    else setDone({ ok: false, text: r.error });
    onRestored(r, label);
  }

  const totalChanges = ver.docs.reduce((n, d) => n + d.changes.length + d.more, 0);
  return (
    <li className={v.item} data-open={open ? "" : undefined} data-latest={latest ? "" : undefined}>
      <button type="button" className={v.head} aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className={v.time}>{timeLabel(ver.at)}</span>
        <span className={v.headMain}>
          <span className={v.title}>
            <span className={v.who} data-by={ver.by} aria-hidden>
              {ver.by === "code" ? "⚙" : ver.who.charAt(0) || "✎"}
            </span>
            {sentence(ver)}
          </span>
          <span className={v.sub}>
            {latest && <span className={v.now}>Así está el sitio ahora</span>}
            {ver.docs.length === 1 ? ver.docs[0].summary : totalChanges ? `${totalChanges} cambio${totalChanges === 1 ? "" : "s"}` : ""}
          </span>
        </span>
        <span className={v.chev} aria-hidden />
      </button>

      <div id={id} className={v.body} role="region" aria-label={`Detalle: ${sentence(ver)}`} hidden={!open}>
        <div className={v.bodyInner}>
          {ver.docs.map((d) => (
            <article key={`${d.collection}/${d.id}`} className={v.doc}>
              <header className={v.docHead}>
                <span className={v.kind}>{d.kind}</span>
                <h4>{d.title}</h4>
                {ver.docs.length > 1 && !latest && (
                  <button type="button" className={v.link} onClick={() => setAsk({ mode: "this", only: d })} disabled={busy}>
                    Volver solo esta
                  </button>
                )}
              </header>
              {d.state === "added" && <p className={v.note}>Se creó en esta publicación.</p>}
              {d.state === "removed" && <p className={v.note}>Se borró en esta publicación.</p>}
              {!!d.changes.length && (
                <ul className={v.changes}>
                  {d.changes.map((c, i) => (
                    <ChangeRow key={i} c={c} />
                  ))}
                </ul>
              )}
              {d.more > 0 && (
                <p className={v.note}>
                  y {d.more} cambio{d.more === 1 ? "" : "s"} más
                </p>
              )}
            </article>
          ))}
          {ver.moreDocs > 0 && <p className={v.note}>Esta publicación tocó además {ver.moreDocs} cosas más (un cambio grande, hecho desde el código).</p>}

          {done && (
            <p className={v.done} data-ok={done.ok ? "" : undefined} role="status">
              {done.ok ? "✓ " : ""}
              {done.text}
            </p>
          )}

          {ask ? (
            <div className={v.confirm} role="group" aria-label="Confirmar">
              <p>
                {ask.mode === "this" ? (
                  <>
                    El sitio va a mostrar {names} <strong>como quedó {whenLabel(ver.at)}</strong>
                    {whenLabel(ver.at).endsWith(".") ? "" : "."}
                  </>
                ) : (
                  <>
                    Se deshace lo que cambió en {names} <strong>{whenLabel(ver.at)}</strong>: vuelve a como estaba justo antes.
                  </>
                )}{" "}
                Lo que hay ahora no se pierde: queda guardado como una versión más.
              </p>
              <div className={v.row}>
                <button ref={confirmRef} type="button" className={v.primary} onClick={run} disabled={busy}>
                  {busy ? "Volviendo…" : ask.mode === "this" ? "Sí, volver a esta versión" : "Sí, deshacer"}
                </button>
                <button type="button" className={v.btn} onClick={() => setAsk(null)} disabled={busy}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className={v.row}>
              {latest ? (
                <button type="button" className={v.primary} onClick={() => setAsk({ mode: "undo" })} disabled={busy}>
                  ↶ Deshacer esta publicación
                </button>
              ) : (
                <>
                  <button type="button" className={v.primary} onClick={() => setAsk({ mode: "this" })} disabled={busy}>
                    ↺ Volver a esta versión
                  </button>
                  <button type="button" className={v.btn} onClick={() => setAsk({ mode: "undo" })} disabled={busy}>
                    Deshacer solo estos cambios
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Segs({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s, i) =>
        s.t === "same" ? (
          <span key={i}>{s.s}</span>
        ) : s.t === "del" ? (
          <del key={i} className={v.del}>
            {s.s}
          </del>
        ) : (
          <ins key={i} className={v.ins}>
            {s.s}
          </ins>
        ),
      )}
    </>
  );
}

function ChangeRow({ c }: { c: Change }) {
  return (
    <li className={v.change} data-kind={c.kind}>
      <span className={v.label}>{c.label}</span>
      {c.kind === "text" && (
        <p className={v.text}>
          <Segs segs={c.segs} />
        </p>
      )}
      {c.kind === "state" && (
        <p className={v.text}>
          <del className={v.del}>{c.before}</del> → <ins className={v.ins}>{c.after}</ins>
        </p>
      )}
      {c.kind === "image" && (
        <div className={v.images}>
          <figure>
            {c.before ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.before} alt="Foto anterior" loading="lazy" decoding="async" />
            ) : (
              <span className={v.noImg}>Sin foto</span>
            )}
            <figcaption>Antes</figcaption>
          </figure>
          <span aria-hidden className={v.arrow}>
            →
          </span>
          <figure>
            {c.after ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.after} alt="Foto nueva" loading="lazy" decoding="async" />
            ) : (
              <span className={v.noImg}>Sin foto</span>
            )}
            <figcaption>Después</figcaption>
          </figure>
        </div>
      )}
      {(c.kind === "added" || c.kind === "removed") && (
        <p className={v.text}>
          <span className={c.kind === "added" ? v.badgeAdd : v.badgeDel}>{c.kind === "added" ? "Nuevo" : "Quitado"}</span>{" "}
          {c.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={v.thumb} src={c.image} alt="" loading="lazy" decoding="async" />
          )}
          {c.kind === "added" ? <ins className={v.ins}>{c.preview}</ins> : <del className={v.del}>{c.preview}</del>}
        </p>
      )}
    </li>
  );
}
