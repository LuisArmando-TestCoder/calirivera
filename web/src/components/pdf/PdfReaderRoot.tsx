"use client";
/**
 * Un solo lector de PDF para todo el sitio. Escucha los clics en cualquier enlace a un .pdf
 * (bloques de enlaces, catálogos, colecciones…) y lo abre adentro de la página, en un <dialog>
 * a pantalla completa. Sin JS, o con Cmd/Ctrl/Shift-clic, el enlace funciona como siempre.
 * También se puede abrir desde código: window.dispatchEvent(new CustomEvent("pdf:open", { detail: { url, title } })).
 */
import { useEffect, useRef, useState } from "react";
import { isPdfHref } from "./pdf-core";
import { PdfBook } from "./PdfBook";
import s from "./pdf.module.scss";

type Open = { url: string; title: string; from: HTMLElement | null };

const titleFrom = (a: HTMLAnchorElement) =>
  a.dataset.pdfTitle ||
  a.querySelector("[class*='linkLabel'], [class*='spineTitle']")?.textContent?.trim() ||
  a.textContent?.replace(/\(se abre en otra pestaña\)/, "").trim() ||
  decodeURIComponent(a.pathname.split("/").pop() ?? "PDF");

export function PdfReaderRoot() {
  const dlg = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<Open | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      if (!a || a.hasAttribute("download") || a.dataset.pdf === "off" || !isPdfHref(a.getAttribute("href"))) return;
      if (document.documentElement.classList.contains("cms-editing")) return;
      if (new URL(a.href, location.href).origin !== location.origin) return;
      e.preventDefault();
      setOpen({ url: a.href, title: titleFrom(a), from: a });
    };
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ url: string; title: string }>).detail;
      setOpen({ url: d.url, title: d.title, from: document.activeElement as HTMLElement | null });
    };
    document.addEventListener("click", onClick);
    window.addEventListener("pdf:open", onOpen);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("pdf:open", onOpen);
    };
  }, []);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = "hidden";
      requestAnimationFrame(() => d.querySelector<HTMLElement>("[role=document]")?.focus());
    }
    if (!open && d.open) d.close();
  }, [open]);

  // al salir de la página (o si Next la esconde para volver rápido), el lector se cierra
  useEffect(() => {
    const d = dlg.current;
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  return (
    <dialog
      ref={dlg}
      className={s.dialog}
      aria-label={open ? `Lector de PDF: ${open.title}` : "Lector de PDF"}
      onClose={() => {
        document.documentElement.style.overflow = "";
        const from = open?.from;
        setOpen(null);
        from?.focus({ preventScroll: true });
      }}
    >
      {open && <PdfBook key={open.url} url={open.url} title={open.title} mode="dialog" onClose={() => dlg.current?.close()} />}
    </dialog>
  );
}
