"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { fold } from "@/lib/format";
import s from "./SearchableList.module.scss";

export type ListItem = {
  id: string;
  href: string;
  title: string;
  meta?: string;
  excerpt?: string;
  /** texto extra que entra en la búsqueda */
  keywords?: string;
};

/**
 * Lista de largo indeterminado con búsqueda (sin tildes) y paginación.
 * El estado vive en la URL (?q=&p=) para que se pueda compartir y volver atrás.
 */
const noop = () => () => {};

export function SearchableList({ items, pageSize = 12, label, empty }: { items: ListItem[]; pageSize?: number; label: string; empty: string }) {
  // Estado inicial desde la URL (en el servidor no hay URL: lista completa, página 1)
  const search = useSyncExternalStore(noop, () => location.search, () => "");
  const params = new URLSearchParams(search);
  const [qState, setQ] = useState<string | null>(null);
  const [pageState, setPage] = useState<number | null>(null);
  const q = qState ?? params.get("q") ?? "";
  const page = pageState ?? Math.max(1, Number(params.get("p") ?? 1));

  useEffect(() => {
    if (qState === null && pageState === null) return;
    const u = new URL(location.href);
    if (q) u.searchParams.set("q", q); else u.searchParams.delete("q");
    if (page > 1) u.searchParams.set("p", String(page)); else u.searchParams.delete("p");
    history.replaceState(history.state, "", u);
  }, [q, page, qState, pageState]);

  const filtered = useMemo(() => {
    const t = fold(q.trim());
    if (!t) return items;
    const words = t.split(/\s+/);
    return items.filter((it) => {
      const hay = fold(`${it.title} ${it.meta ?? ""} ${it.excerpt ?? ""} ${it.keywords ?? ""}`);
      return words.every((w) => hay.includes(w));
    });
  }, [items, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * pageSize, cur * pageSize);

  return (
    <div className={s.root}>
      <div className={s.search}>
        <label htmlFor="buscar" className={s.searchLabel}>Buscar en {label}</label>
        <input
          id="buscar"
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Escriba un nombre, un mes, un año…"
          className={s.input}
          autoComplete="off"
        />
        <p className={s.status} role="status" aria-live="polite">
          {filtered.length === items.length ? `${items.length} entradas` : `${filtered.length} de ${items.length}`}
        </p>
      </div>

      {shown.length ? (
        <ol className={s.list}>
          {shown.map((it) => (
            <li key={it.id}>
              <Link href={it.href} className={s.item}>
                {it.meta && <span className={s.meta}>{it.meta}</span>}
                <span className={s.title}>{it.title}</span>
                {it.excerpt && <span className={s.excerpt}>{it.excerpt}</span>}
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className={s.empty}>{q ? `Nada coincide con «${q}». Pruebe con otra palabra o un año.` : empty}</p>
      )}

      {pages > 1 && (
        <nav className={s.pager} aria-label="Páginas">
          <button type="button" onClick={() => { setPage(cur - 1); scrollTo({ top: 0 }); }} disabled={cur === 1}>Anteriores</button>
          <span className={s.pageInfo}>Página {cur} de {pages}</span>
          <button type="button" onClick={() => { setPage(cur + 1); scrollTo({ top: 0 }); }} disabled={cur === pages}>Siguientes</button>
        </nav>
      )}
    </div>
  );
}
