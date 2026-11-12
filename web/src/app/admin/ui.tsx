import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "./actions";
import s from "@/components/cms/admin/admin.module.scss";

export function AdminHeader() {
  return (
    <header className={s.top}>
      <Link href="/admin" className={s.brand}>
        Cali Rivera<small>Editor</small>
      </Link>
      <nav className={s.nav} aria-label="Editor">
        <Link href="/admin">Inicio</Link>
        <a href="/" target="_blank" rel="noreferrer">
          Ver el sitio ↗
        </a>
        <Link href="/admin/historial">Versiones</Link>
        <Link href="/admin/papelera">Papelera</Link>
        <form action={logoutAction}>
          <button type="submit">Salir</button>
        </form>
      </nav>
    </header>
  );
}

export function PageHead({ title, lead, crumbs, children }: { title: string; lead?: string; crumbs?: { href: string; label: string }[]; children?: ReactNode }) {
  return (
    <div className={s.pageHead}>
      {crumbs && (
        <nav className={s.crumbs} aria-label="Ruta">
          {crumbs.map((c, i) => (
            <span key={c.href}>
              {i > 0 && " / "}
              <Link href={c.href}>{c.label}</Link>
            </span>
          ))}
        </nav>
      )}
      <h1>{title}</h1>
      {lead && <p className={s.lead}>{lead}</p>}
      {children}
    </div>
  );
}

export function Loading({ text = "Cargando…" }: { text?: string }) {
  return (
    <p className={s.loading} role="status">
      {text}
    </p>
  );
}

export const fmtDate = (iso?: unknown) => {
  if (typeof iso !== "string" || !iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-CR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Costa_Rica" }).format(d);
};

export const fmtDay = (iso?: unknown) => {
  if (typeof iso !== "string" || !iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-CR", { dateStyle: "medium", timeZone: "America/Costa_Rica" }).format(d);
};

export const ACTION_LABELS: Record<string, string> = {
  create: "Creó",
  update: "Editó",
  publish: "Publicó",
  unpublish: "Pasó a borrador",
  trash: "Mandó a la papelera",
  restore: "Recuperó",
  purge: "Borró para siempre",
  revert: "Deshizo un cambio en",
  inline: "Editó en la página",
  login: "Entró al editor",
  logout: "Salió del editor",
  upload: "Subió una foto",
};
