import Link from "next/link";
import { Signature } from "@/components/brand/Signature";
import { SignatureInView } from "@/components/brand/SignatureMoments";
import type { SiteSettings } from "@/lib/content/types";
import { NAV } from "./nav";
import { OriensCredit } from "./OriensCredit";
import s from "./Footer.module.scss";

/**
 * Pie del sitio, en tres tiempos:
 *  1. la invitación — escribirle a Cali (correo enorme, WhatsApp) es lo primero que se ve;
 *  2. el índice — el Taller (dirección, horarios, mapa), el mismo índice numerado del menú y las redes;
 *  3. la despedida — el lema a todo el ancho, la firma que se escribe, y la letra chica.
 * Cada bloque tiene su encabezado (oculto a la vista, presente para lectores de pantalla y buscadores).
 */
export function Footer({ settings }: { settings: SiteSettings }) {
  const year = new Date(settings.updatedAt).getUTCFullYear() || 2026;
  const wa = settings.whatsapp?.replace(/\D/g, "");
  let n = 0;
  return (
    <footer data-site-chrome className={s.footer}>
      <section className={s.invite} aria-labelledby="pie-contacto">
        <h2 id="pie-contacto" className={s.kicker}>
          Hablemos
        </h2>
        <p className={s.pitch}>Para adquirir una obra, proponer una exposición o visitar el Taller.</p>
        <a className={s.mail} href={`mailto:${settings.email}`}>
          <span>{settings.email}</span>
          <span className={s.go} aria-hidden>
            →
          </span>
        </a>
        {wa && (
          <a className={s.pill} href={`https://wa.me/${wa}`} target="_blank" rel="noopener">
            WhatsApp <span>{settings.whatsapp}</span>
          </a>
        )}
      </section>

      <div className={s.index}>
        {settings.address && (
          <section className={s.col} aria-labelledby="pie-taller">
            <h2 id="pie-taller" className={s.label}>
              Taller del Artista
            </h2>
            <address className={s.address}>{settings.address}</address>
            {settings.mapUrl && (
              <a className={s.text} href={settings.mapUrl} target="_blank" rel="noopener">
                Cómo llegar <span aria-hidden>↗</span>
              </a>
            )}
            {settings.hours && settings.hours.length > 0 && (
              <dl className={s.hours}>
                {settings.hours.map((h) => (
                  <div key={h.days}>
                    <dt>{h.days}</dt>
                    <dd>{h.time}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        )}
        {NAV.map((g, gi) => (
          <nav key={g.group} className={s.col} aria-labelledby={`pie-g${gi}`}>
            <h2 id={`pie-g${gi}`} className={s.label}>
              {g.group}
            </h2>
            <ul className={s.list}>
              {g.items.map((it) => (
                <li key={it.href}>
                  <Link href={it.href}>
                    <span className={s.num} aria-hidden>
                      {String(++n).padStart(2, "0")}
                    </span>
                    {it.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        {settings.social.length > 0 && (
          <nav className={s.col} aria-labelledby="pie-redes">
            <h2 id="pie-redes" className={s.label}>
              Redes
            </h2>
            <ul className={s.list}>
              {settings.social.map((x) => (
                <li key={x.href}>
                  <a href={x.href} target="_blank" rel="noopener me">
                    {x.label} <span aria-hidden>↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      <p className={s.wordmark} aria-hidden>
        <span>El arte es</span>
        <span>para ser libres.</span>
      </p>

      <div className={s.close}>
        <SignatureInView className={s.signature}>
          <Signature draw="view" seconds={3} title="Firma de Cali Rivera" />
        </SignatureInView>
        <div className={s.legal}>
          <p>
            © {year} Cali Rivera · {settings.footerNote}
          </p>
          <p className={s.small}>
            <a href="#contenido">Volver arriba ↑</a>
            <Link href="/admin/entrar" prefetch={false} rel="nofollow">
              Entrar a editar
            </Link>
            <span>
              Sitio creado por{" "}
              <OriensCredit />
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
