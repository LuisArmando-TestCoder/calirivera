"use client";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Face } from "@/lib/content/faces";
import s from "./faces.module.scss";

/**
 * Las vistas de una obra (frente, reverso, detalles): se ve una a la vez y debajo quedan las pestañas para cambiar.
 * Las flechas ← → pasan de una a otra, como en cualquier grupo de pestañas.
 */
export function Faces({ faces, children }: { faces: Face[]; children: ReactNode[] }) {
  const [current, setCurrent] = useState(0);
  const [turned, setTurned] = useState(false); // la primera vista no se anima al cargar
  const id = useId();
  const show = (i: number) => {
    setCurrent(i);
    setTurned(true);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (current + step + faces.length) % faces.length;
    show(next);
    (e.currentTarget.children[next] as HTMLElement | undefined)?.focus();
  };
  return (
    <div className={s.faces} data-turned={turned ? "" : undefined}>
      <div className={s.stage}>
        {children.map((view, i) => (
          <div key={faces[i].label} id={`${id}-view-${i}`} role="tabpanel" aria-labelledby={`${id}-tab-${i}`} className={s.view} hidden={i !== current}>
            {view}
          </div>
        ))}
      </div>
      <div role="tablist" aria-label="Vistas de la obra" className={s.tabs} onKeyDown={onKey}>
        {faces.map((face, i) => (
          <button
            key={face.label}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === current}
            aria-controls={`${id}-view-${i}`}
            tabIndex={i === current ? 0 : -1}
            className={s.tab}
            onClick={() => show(i)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={face.thumb} alt="" width={32} height={32} loading="lazy" />
            {face.label}
          </button>
        ))}
      </div>
    </div>
  );
}
