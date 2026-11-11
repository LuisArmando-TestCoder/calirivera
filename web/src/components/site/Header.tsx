"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { sfx, SoundToggle } from "@/components/sound/SoundRoot";
import { Signature } from "@/components/brand/Signature";
import { NAV } from "./nav";
import s from "./Header.module.scss";

export type ExtraNav = { href: string; label: string; group: "obra" | "taller" };

export function Header({
  email,
  whatsapp,
  extra = [],
}: {
  email: string;
  whatsapp?: string;
  extra?: ExtraNav[];
}) {
  // el menú fijo + las páginas que Cali creó desde el editor, cada una en su grupo
  const groups = NAV.map((g, i) => ({ ...g, items: [...g.items, ...extra.filter((e) => (e.group === "obra" ? i === 0 : i === 1) && !g.items.some((it) => it.href === e.href))] }));
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  // Sin usePathname: así la cabecera vive en el shell estático de todas las rutas
  const [pathname, setPathname] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Vista viva: al pasar por un renglón, el renglón mismo se vuelve una ventana a esa página. Adentro hay un
  // iframe de la página real (a escala), que se va desplazando sola mientras el puntero sigue ahí. El nombre
  // queda siempre encima, sobre un velo oscuro: ninguna imagen tapa texto. Solo con mouse, solo un iframe a
  // la vez, y se desmonta al salir o al cerrar el menú.
  useEffect(() => {
    const nav = navRef.current;
    if (!open || !nav) return;
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const SCALE = 0.42; // la página se ve al 42 %
    const VIEW_H = 860; // alto de la "pantalla" de la página, en sus propios px
    const SPEED = 80; // px de página por segundo
    type Live = { a: HTMLAnchorElement; frame: HTMLIFrameElement; raf: number; timer: number; y: number; dir: 1 | -1; last: number };
    let cur: Live | null = null;
    const drop = (l: Live) => {
      cancelAnimationFrame(l.raf);
      clearTimeout(l.timer);
      delete l.a.dataset.live;
      window.setTimeout(() => l.frame.remove(), 450); // después de desvanecerse
    };
    const enter = (e: Event) => {
      const a = e.currentTarget as HTMLAnchorElement;
      const host = a.querySelector<HTMLElement>("[data-live-host]");
      if (!host || cur?.a === a) return;
      if (cur) drop(cur);
      const frame = document.createElement("iframe");
      frame.tabIndex = -1;
      frame.setAttribute("aria-hidden", "true");
      frame.setAttribute("inert", "");
      frame.title = "";
      const live: Live = { a, frame, raf: 0, timer: 0, y: 0, dir: 1, last: 0 };
      cur = live;
      frame.addEventListener("load", () => {
        const win = frame.contentWindow;
        const doc = frame.contentDocument;
        if (cur !== live || !win || !doc) return;
        doc.documentElement.dataset.embed = ""; // la página, dentro del menú, esconde su cabecera y su pie
        a.dataset.live = "";
        const tick = (t: number) => {
          const dt = Math.min(0.05, (t - (live.last || t)) / 1000);
          live.last = t;
          const max = doc.documentElement.scrollHeight - win.innerHeight;
          if (max > 4) {
            live.y += SPEED * dt * live.dir;
            if (live.y >= max) [live.y, live.dir] = [max, -1];
            else if (live.y <= 0) [live.y, live.dir] = [0, 1];
            win.scrollTo(0, live.y);
          }
          live.raf = requestAnimationFrame(tick);
        };
        live.raf = requestAnimationFrame(tick);
      });
      // un instante de espera: cruzar el menú de pasada no carga nada
      live.timer = window.setTimeout(() => {
        const r = a.getBoundingClientRect();
        frame.style.width = `${Math.ceil(r.width / SCALE)}px`;
        frame.style.height = `${VIEW_H}px`;
        frame.style.transform = `translateY(${(-(VIEW_H * SCALE - r.height) * 0.4).toFixed(1)}px) scale(${SCALE})`;
        frame.src = a.getAttribute("href") ?? "/";
        host.append(frame);
      }, 160);
    };
    const leave = (e: Event) => {
      if (cur?.a !== e.currentTarget) return;
      drop(cur);
      cur = null;
    };
    const links = [...nav.querySelectorAll<HTMLAnchorElement>("a[data-live-link]")];
    for (const a of links) {
      a.addEventListener("pointerenter", enter);
      a.addEventListener("pointerleave", leave);
    }
    return () => {
      for (const a of links) {
        a.removeEventListener("pointerenter", enter);
        a.removeEventListener("pointerleave", leave);
      }
      if (cur) {
        cancelAnimationFrame(cur.raf);
        clearTimeout(cur.timer);
        delete cur.a.dataset.live;
        cur.frame.remove();
      }
    };
  }, [open]);

  // Se esconde al bajar, vuelve al subir. Una página puede fijarla escondida con
  // html[data-chrome-lock="hidden"] (Memoria: mientras se recorre la trama, la cabecera no vuelve).
  // Publica su estado en html[data-header] para que las barras pegajosas sigan su borde inferior.
  useEffect(() => {
    const html = document.documentElement;
    let last = scrollY;
    let h = false;
    const set = (v: boolean) => {
      if (v === h) return;
      h = v;
      setHidden(v);
      html.dataset.header = v ? "hidden" : "shown";
    };
    const on = () => {
      const y = scrollY;
      if (html.dataset.chromeLock === "hidden") set(true);
      else if (y < 160 || y < last - 4) set(false);
      else if (y > last + 4) set(true);
      last = y;
    };
    html.dataset.header = "shown";
    addEventListener("scroll", on, { passive: true });
    addEventListener("chrome:lock", on);
    return () => {
      removeEventListener("scroll", on);
      removeEventListener("chrome:lock", on);
      delete html.dataset.header;
    };
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
          <Signature className={s.markSig} seconds={2.2} delay={0.3} />
          <span>Cali Rivera</span>
        </Link>
        <span className={s.sound}>
          <SoundToggle />
        </span>
        <button
          ref={button}
          type="button"
          className={s.toggle}
          aria-expanded={open}
          aria-controls="menu"
          onClick={() => { setPathname(location.pathname); sfx(open ? "close" : "open"); setOpen((o) => !o); }}
        >
          <span className={s.toggleLabel}>{open ? "Cerrar" : "Menú"}</span>
          <span className={s.toggleIcon} aria-hidden><i /><i /></span>
        </button>
      </div>
      <div id="menu" ref={panel} className={s.panel} hidden={!open} data-lenis-prevent>
        <nav className={s.nav} aria-label="Principal" ref={navRef}>
          {groups.map((g, gi) => {
            const before = groups.slice(0, gi).reduce((n, x) => n + x.items.length, 0);
            return (
              <div key={g.group} className={s.group} style={{ "--g": gi } as React.CSSProperties}>
                <p className={s.groupLabel}>
                  <span>{g.group}</span>
                  <span aria-hidden>{String(g.items.length).padStart(2, "0")}</span>
                </p>
                <ul>
                  {g.items.map((it, i) => (
                    <li key={it.href} style={{ "--i": before + i } as React.CSSProperties}>
                      <Link
                        href={it.href}
                        className={s.link}
                        aria-current={pathname === it.href ? "page" : undefined}
                        data-live-link
                        onClick={() => setOpen(false)}
                      >
                        <span className={s.live} data-live-host aria-hidden />
                        <span className={s.num} aria-hidden>
                          {String(before + i + 1).padStart(2, "0")}
                        </span>
                        <span className={s.linkText}>{it.label}</span>
                        {"note" in it && it.note && <span className={s.linkNote}>{it.note}</span>}
                        <span className={s.arrow} aria-hidden>
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className={s.contact}>
          <a href={`mailto:${email}`}>{email}</a>
          {whatsapp && <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}>WhatsApp {whatsapp}</a>}
        </div>
      </div>
    </header>
  );
}
