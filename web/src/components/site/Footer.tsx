import Link from "next/link";
import type { SiteSettings } from "@/lib/content/types";
import { NAV } from "./nav";
import s from "./Footer.module.scss";

export function Footer({ settings }: { settings: SiteSettings }) {
  const year = new Date(settings.updatedAt).getUTCFullYear() || 2026;
  return (
    <footer data-site-chrome className={s.footer}>
      <div className={s.inner}>
        <div className={s.cols}>
          <div className={s.col}>
            <p className={s.label}>Escribir</p>
            <a className={s.big} href={`mailto:${settings.email}`}>{settings.email}</a>
            {settings.whatsapp && (
              <a className={s.line} href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`}>WhatsApp {settings.whatsapp}</a>
            )}
            <p className={s.note}>Consultas de adquisición y gestión cultural.</p>
          </div>
          {settings.address && (
            <div className={s.col}>
              <p className={s.label}>Taller del Artista</p>
              <address className={s.line}>{settings.address}</address>
              {settings.hours?.map((h) => (
                <p key={h.days} className={s.hours}><span>{h.days}</span><span>{h.time}</span></p>
              ))}
            </div>
          )}
          <nav className={s.col} aria-label="Pie de página">
            <p className={s.label}>Sitio</p>
            <ul className={s.navList}>
              {NAV.flatMap((g) => g.items).map((it) => (
                <li key={it.href}><Link href={it.href}>{it.label}</Link></li>
              ))}
            </ul>
          </nav>
          <div className={s.col}>
            <p className={s.label}>Redes</p>
            <ul className={s.navList}>
              {settings.social.map((x) => (
                <li key={x.href}><a href={x.href} target="_blank" rel="noopener">{x.label}</a></li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <p className={s.wordmark} aria-hidden>
        <span>El arte es</span>
        <span>para ser libres</span>
      </p>
      <p className={s.legal}>© {year} Cali Rivera · {settings.footerNote}</p>
    </footer>
  );
}
