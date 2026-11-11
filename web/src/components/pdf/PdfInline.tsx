"use client";
/** El catálogo abierto adentro de la página (no en otra pestaña), con botón a pantalla completa. */
import { useEffect, useRef, useState } from "react";
import { PdfBook } from "./PdfBook";
import s from "./pdf.module.scss";

export function PdfInline({ url, title }: { url: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  // no se carga pdf.js hasta que el lector está por entrar en pantalla
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setNear(true), io.disconnect()), { rootMargin: "50% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={s.inline}>
      {near ? (
        <PdfBook url={url} title={title} mode="inline" onExpand={() => window.dispatchEvent(new CustomEvent("pdf:open", { detail: { url, title } }))} />
      ) : (
        <a href={url} className={s.inlinePlaceholder}>
          Abrir «{title}»
        </a>
      )}
    </div>
  );
}
