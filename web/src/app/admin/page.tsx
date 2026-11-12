import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/server";
import { listAudit } from "@/lib/cms/audit";
import { COLLECTION_DEFS, isContentCollection } from "@/lib/cms/config";
import { listInlineDrafts } from "@/lib/cms/write";
import { getStore } from "@/lib/cms/store";
import { smtpConfigured } from "@/lib/auth/mail";
import { ACTION_LABELS, AdminHeader, fmtDate, Loading, PageHead } from "./ui";
import s from "@/components/cms/admin/admin.module.scss";

const QUICK = [
  { href: "/admin/posts/nuevo", icon: "✎", label: "Nueva entrada de Bitácora", desc: "Un evento, una visita, una noticia", primary: true },
  { href: "/admin/people/nuevo", icon: "☺", label: "Nueva persona o beneficiario", desc: "Poetas, músicos, artistas apoyados" },
  { href: "/admin/artworks/nuevo", icon: "▣", label: "Nueva obra", desc: "Foto y ficha técnica" },
  { href: "/admin/memories/nuevo", icon: "◌", label: "Subir un recuerdo", desc: "Una foto vieja del Taller, desde el celular" },
  { href: "/admin/memories?aiAltered=true&estado=draft", icon: "◑", label: "Recuerdos por revisar", desc: "Fotos que pasaron por IA: aprobalas o dejalas ocultas" },
  { href: "/", icon: "◐", label: "Editar directo en el sitio", desc: "Abrí cualquier página y tocá «Editar página»", external: true },
];

const SECTIONS = ["memories", "collections", "pages", "programs", "catalogs", "posts", "people", "artworks"] as const;

async function Home() {
  await requireAdmin("/admin");
  const [activity, drafts] = await Promise.all([listAudit(8), listInlineDrafts()]);
  const store = getStore();
  const warnings: string[] = [];
  if (store.kind === "local") warnings.push("Modo local: los cambios se guardan en archivos de esta computadora (no hay service account de Firebase).");
  if (!smtpConfigured()) warnings.push("El correo (SMTP) no está configurado: los códigos de acceso se imprimen en la consola del servidor.");
  return (
    <>
      <AdminHeader />
      <main className={s.main}>
        <PageHead title="Hola, Cali" lead="¿Qué querés hacer hoy?" />
        {warnings.map((w) => (
          <p key={w} className={s.notice}>
            {w}
          </p>
        ))}
        <div className={s.tiles}>
          {QUICK.map((q) =>
            q.external ? (
              <a key={q.href} href={q.href} className={s.tile}>
                <span className={s.tileIcon} aria-hidden>
                  {q.icon}
                </span>
                <span className={s.tileLabel}>{q.label}</span>
                <span className={s.tileDesc}>{q.desc}</span>
              </a>
            ) : (
              <Link key={q.href} href={q.href} className={s.tile} data-primary={q.primary ? "" : undefined}>
                <span className={s.tileIcon} aria-hidden>
                  {q.icon}
                </span>
                <span className={s.tileLabel}>{q.label}</span>
                <span className={s.tileDesc}>{q.desc}</span>
              </Link>
            ),
          )}
        </div>

        <h2 className={s.sectionTitleH}>Todo el contenido</h2>
        <div className={s.tiles}>
          {SECTIONS.map((c) => {
            const d = COLLECTION_DEFS[c];
            return (
              <Link key={c} href={`/admin/${c}`} className={s.tile}>
                <span className={s.tileIcon} aria-hidden>
                  {d.icon}
                </span>
                <span className={s.tileLabel}>{d.label}</span>
                <span className={s.tileDesc}>{d.description}</span>
              </Link>
            );
          })}
          <Link href="/admin/settings/site" className={s.tile}>
            <span className={s.tileIcon} aria-hidden>
              ⚙
            </span>
            <span className={s.tileLabel}>Ajustes</span>
            <span className={s.tileDesc}>{COLLECTION_DEFS.settings.description}</span>
          </Link>
        </div>

        {drafts.length > 0 && (
          <>
            <h2 className={s.sectionTitleH}>Cambios sin publicar en páginas</h2>
            <ul className={`${s.card} ${s.activity}`}>
              {drafts.map((d) => (
                <li key={d.pathname}>
                  <span className={s.actWhat}>
                    <strong>{d.pathname}</strong>
                    <small>
                      {d.count} cambio{d.count === 1 ? "" : "s"} · {fmtDate(d.savedAt)}
                    </small>
                  </span>
                  <a className={s.btnSmall} href={d.pathname}>
                    Seguir editando
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}

        <h2 className={s.sectionTitleH}>Últimos cambios</h2>
        {activity.length === 0 ? (
          <p className={s.empty}>Todavía no hay cambios.</p>
        ) : (
          <ul className={`${s.card} ${s.activity}`}>
            {activity.map((a) => (
              <li key={a.id}>
                <span className={s.actWhat}>
                  <strong>
                    {ACTION_LABELS[a.action] ?? a.action} {a.title ? `«${a.title}»` : ""}
                  </strong>
                  <small>
                    {a.collection && isContentCollection(a.collection) ? `${COLLECTION_DEFS[a.collection].label} · ` : ""}
                    {fmtDate(a.at)}
                  </small>
                </span>
                {a.collection && a.docId && isContentCollection(a.collection) && a.action !== "purge" && (
                  <Link className={s.btnSmallGhost} href={`/admin/${a.collection}/${a.docId}`}>
                    Abrir
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <p style={{ marginTop: 12 }}>
          <Link className={s.btnSmallGhost} href="/admin/historial">
            Ver todas las versiones →
          </Link>
        </p>
      </main>
    </>
  );
}

export default function AdminHome() {
  return (
    <Suspense fallback={<Loading />}>
      <Home />
    </Suspense>
  );
}
