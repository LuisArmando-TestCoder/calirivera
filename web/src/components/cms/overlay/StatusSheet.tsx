"use client";
import Link from "next/link";
import { Sheet } from "../shared/Sheet";
import { dismissSending, type LocalDraft, type Sending } from "./local";
import o from "./overlay.module.scss";

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "recién";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
};
const STEPS = ["Guardado acá", "Enviado", "Armando el sitio", "En línea"] as const;
/** cuántos pasos están completos, y cuál está en curso */
const progress = (s: Sending) => (s.state === "live" ? { done: 4, active: -1 } : s.state === "building" ? { done: 2, active: 2 } : s.state === "failed" ? { done: 2, active: -1 } : { done: 2, active: 2 });

/**
 * «Estado del sitio»: qué está en línea, qué va en camino y qué falta publicar, en palabras de todos los días.
 * Es el mismo panel en todas las páginas.
 */
export function StatusSheet({ open, onClose, sendings, drafts, here }: { open: boolean; onClose: () => void; sendings: Sending[]; drafts: LocalDraft[]; here: string }) {
  const going = sendings.filter((s) => s.state !== "live");
  const done = sendings.filter((s) => s.state === "live");
  const calm = !going.length && !drafts.length;
  return (
    <Sheet open={open} onClose={onClose} title="Estado del sitio">
      <div className={o.statusBody}>
        {calm && (
          <p className={o.calm}>
            <span aria-hidden>✓</span> Todo lo que publicaste está en línea. No hay nada pendiente.
          </p>
        )}

        {going.length > 0 && (
          <section aria-labelledby="st-going">
            <h3 id="st-going">En camino</h3>
            <ul className={o.sendList}>
              {going.map((s) => {
                const p = progress(s);
                return (
                  <li key={s.commit} data-state={s.state}>
                    <p className={o.sendTitle}>
                      {s.label} <small>{ago(s.at)}</small>
                    </p>
                    <ol className={o.steps} aria-label="Pasos">
                      {STEPS.map((label, i) => (
                        <li key={label} data-done={i < p.done ? "" : undefined} data-active={i === p.active ? "" : undefined} aria-current={i === p.active ? "step" : undefined}>
                          <i aria-hidden />
                          <span>{i === 2 && s.state === "sent" ? "En fila para armarse" : label}</span>
                        </li>
                      ))}
                    </ol>
                    {s.state === "failed" ? (
                      <p className={o.sendNote} data-bad>
                        El sitio no se pudo armar con este cambio, así que <strong>sigue como estaba</strong>. Tu cambio no se perdió: quedó guardado. Avisale a quien te ayuda con el sitio.{" "}
                        <button type="button" onClick={() => dismissSending(s.commit)}>
                          Quitar este aviso
                        </button>
                      </p>
                    ) : (
                      <p className={o.sendNote}>
                        Vos ya lo ves en esta página. Para el resto del mundo aparece cuando el sitio termine de armarse: suele tardar de 2 a 4 minutos. Podés seguir editando o cerrar todo; llega igual.
                        {s.href ? ` La página nueva va a estar en ${s.href}.` : ""}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {drafts.length > 0 && (
          <section aria-labelledby="st-drafts">
            <h3 id="st-drafts">Falta publicar</h3>
            <p className={o.sendNote}>Cambios guardados solo en este dispositivo. Nadie más los ve hasta que toques «Publicar».</p>
            <ul className={o.draftList}>
              {drafts.map((d) => (
                <li key={d.pathname}>
                  <span>
                    <strong>{d.pathname === "/" ? "Inicio" : d.pathname}</strong> · {d.ops.length} cambio{d.ops.length === 1 ? "" : "s"} · {ago(d.savedAt)}
                  </span>
                  {d.pathname === here ? <em>estás acá</em> : <Link href={`${d.pathname}?editar`} prefetch={false} onClick={onClose}>Ir a publicarlos</Link>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {done.length > 0 && (
          <section aria-labelledby="st-done">
            <h3 id="st-done">Ya en línea</h3>
            <ul className={o.draftList}>
              {done.slice(0, 6).map((s) => (
                <li key={s.commit}>
                  <span>
                    <span aria-hidden>✓</span> {s.label} · {ago(s.liveAt ?? s.at)}
                  </span>
                  {s.href && <Link href={s.href} onClick={onClose}>Ver la página</Link>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <details className={o.how}>
          <summary>¿Cómo funciona esto?</summary>
          <ol>
            <li>
              <strong>Editás sobre la página misma.</strong> Tocás un texto y escribís; tocás una foto y la cambiás; con «＋ Agregar» sumás obras, fotos, textos o enlaces de video.
            </li>
            <li>
              <strong>Cada cambio se guarda solo en este dispositivo.</strong> Si se apaga el teléfono o se cierra la ventana, al volver a «Editar esta página» está todo como lo dejaste.
            </li>
            <li>
              <strong>«Publicar» lo envía.</strong> Hasta ese momento nadie más ve nada. Al publicar, el cambio queda guardado para siempre en el archivo del sitio, con fecha.
            </li>
            <li>
              <strong>El sitio se arma de nuevo, solo.</strong> Tarda unos minutos. Mientras tanto vos ya ves tu cambio; cuando termina, lo ve todo el mundo y te aviso.
            </li>
            <li>
              <strong>Nada se pierde.</strong> «Archivar» esconde sin borrar, la papelera se puede vaciar o recuperar, y en Panel → Historial se puede volver atrás cualquier cambio.
            </li>
          </ol>
        </details>
      </div>
    </Sheet>
  );
}
