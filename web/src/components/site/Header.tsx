"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { NAV } from "./nav";
import s from "./Header.module.scss";

export function Header({ email, whatsapp }: { email: string; whatsapp?: string }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  // Sin usePathname: así la cabecera vive en el shell estático de todas las rutas
  const [pathname, setPathname] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);


  // Se esconde al bajar, vuelve al subir
  useEffect(() => {
    let last = scrollY;
    const on = () => {
      const y = scrollY;
      setHidden(y > 160 && y > last + 4);
      if (y < last - 4 || y < 160) setHidden(false);
      last = y;
    };
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.documentElement.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>("a");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); button.current?.focus(); }
      if (e.key === "Tab" && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>("a, button")];
        const [a, z] = [f[0], f[f.length - 1]];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    addEventListener("keydown", onKey);
    return () => { document.documentElement.style.overflow = ""; removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <header data-site-chrome className={`${s.header} ${hidden && !open ? s.hidden : ""} ${open ? s.isOpen : ""}`}>
      <div className={s.bar}>
        <Link href="/" className={s.mark} aria-label="Cali Rivera, inicio" onClick={() => setOpen(false)}>
          Cali Rivera
        </Link>
        <button
          ref={button}
          type="button"
          className={s.toggle}
          aria-expanded={open}
          aria-controls="menu"
          onClick={() => { setPathname(location.pathname); setOpen((o) => !o); }}
        >
          <span className={s.toggleLabel}>{open ? "Cerrar" : "Menú"}</span>
          <span className={s.toggleIcon} aria-hidden><i /><i /></span>
        </button>
      </div>
      <div id="menu" ref={panel} className={s.panel} hidden={!open} data-lenis-prevent>
        <nav className={s.nav} aria-label="Principal">
          {NAV.map((g) => (
            <div key={g.group} className={s.group}>
              <p className={s.groupLabel}>{g.group}</p>
              <ul>
                {g.items.map((it, i) => (
                  <li key={it.href} style={{ "--i": i } as React.CSSProperties}>
                    <Link href={it.href} className={s.link} aria-current={pathname === it.href ? "page" : undefined} onClick={() => setOpen(false)}>
                      {it.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className={s.contact}>
          <a href={`mailto:${email}`}>{email}</a>
          {whatsapp && <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}>WhatsApp {whatsapp}</a>}
        </div>
      </div>
    </header>
  );
}
