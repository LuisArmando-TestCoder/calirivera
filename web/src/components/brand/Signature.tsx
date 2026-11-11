import { useId, type CSSProperties } from "react";
import { SIG_H, SIG_OUTLINE, SIG_PEN, SIG_STROKES, SIG_W } from "./signature-data";
import s from "./signature.module.scss";

const TOTAL = SIG_STROKES.reduce((n, k) => n + k.len, 0);
// cada trazo empieza cuando termina el anterior, con una pausa mínima al levantar la pluma
const LIFT = 0.018;
const SPAN = 1 + LIFT * (SIG_STROKES.length - 1);
const PLAN = SIG_STROKES.reduce<{ d: string; len: number; at: number; dur: number }[]>((acc, k, i) => {
  const prev = acc[i - 1];
  const at = prev ? prev.at + prev.dur + LIFT / SPAN : 0;
  acc.push({ ...k, at, dur: k.len / TOTAL / SPAN });
  return acc;
}, []);

/**
 * La firma de Cali, vectorizada de su logo. Lo que se ve es el contorno exacto del original; lo que se anima
 * es una máscara con el recorrido de la pluma, trazo por trazo y en el orden en que se firma: la firma
 * «se escribe» y queda idéntica al original. Solo CSS (sin JS): con movimiento reducido aparece ya escrita.
 *
 * `draw`: "load" se firma al montarse · "view" espera a tener la clase global `is-inview` en un ancestro
 * (ver SignatureInView) · "none" fija.
 */
export function Signature({
  className,
  seconds = 2.6,
  delay = 0,
  draw = "load",
  title,
}: {
  className?: string;
  seconds?: number;
  delay?: number;
  draw?: "load" | "view" | "none";
  title?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg
      className={`${s.sig} ${className ?? ""}`}
      viewBox={`0 0 ${SIG_W} ${SIG_H}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-draw={draw}
      style={{ "--sig-seconds": `${seconds}s`, "--sig-delay": `${delay}s` } as CSSProperties}
    >
      {draw !== "none" && (
        <mask id={`m${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width={SIG_W} height={SIG_H}>
          {PLAN.map((k, i) => (
            <path
              key={i}
              d={k.d}
              className={s.stroke}
              fill="none"
              stroke="#fff"
              strokeWidth={SIG_PEN + 10}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={k.len + 2}
              style={{ "--len": k.len + 2, "--at": k.at.toFixed(4), "--dur": k.dur.toFixed(4) } as CSSProperties}
            />
          ))}
        </mask>
      )}
      <path d={SIG_OUTLINE} fill="currentColor" fillRule="evenodd" mask={draw !== "none" ? `url(#m${id})` : undefined} />
    </svg>
  );
}
