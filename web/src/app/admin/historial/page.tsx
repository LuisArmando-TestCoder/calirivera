import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/server";
import { listAudit } from "@/lib/cms/audit";
import { COLLECTION_DEFS, isContentCollection } from "@/lib/cms/config";
import { RevertButton } from "@/components/cms/admin/RowActions";
import { ACTION_LABELS, AdminHeader, fmtDate, Loading, PageHead } from "../ui";
import s from "@/components/cms/admin/admin.module.scss";

const REVERTIBLE = new Set(["create", "update", "publish", "unpublish", "trash", "restore", "inline", "revert"]);

async function History({ searchParams }: PageProps<"/admin/historial">) {
  await requireAdmin("/admin/historial");
  const sp = await searchParams;
  const after = typeof sp.despues === "string" ? sp.despues : undefined;
  const entries = await listAudit(40, after);
  return (
    <>
      <AdminHeader />
      <main className={s.main}>
        <PageHead title="Historial" lead="Cada cambio queda guardado. Podés deshacer cualquiera." crumbs={[{ href: "/admin", label: "Inicio" }]} />
        {entries.length === 0 ? (
          <p className={s.empty}>Sin cambios todavía.</p>
        ) : (
          <ul className={`${s.card} ${s.activity}`}>
            {entries.map((a) => (
              <li key={a.id}>
                <span className={s.actWhat}>
                  <strong>
                    {ACTION_LABELS[a.action] ?? a.action} {a.title ? `«${a.title}»` : ""}
                  </strong>
                  <small>
                    {a.collection && isContentCollection(a.collection) ? `${COLLECTION_DEFS[a.collection].label} · ` : ""}
                    {fmtDate(a.at)}
                    {a.note ? ` · ${a.note}` : ""}
                  </small>
                </span>
                <span className={s.row}>
                  {a.collection && a.docId && isContentCollection(a.collection) && a.action !== "purge" && (
                    <Link className={s.btnSmallGhost} href={`/admin/${a.collection}/${a.docId}`}>
                      Abrir
                    </Link>
                  )}
                  {REVERTIBLE.has(a.action) && a.collection && (
                    <RevertButton auditId={a.id} title={a.title ?? a.docId ?? ""} what={(ACTION_LABELS[a.action] ?? a.action).toLowerCase()} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {entries.length === 40 && (
          <nav className={s.pager}>
            <i />
            <Link href={`?despues=${entries[entries.length - 1].id}`}>Más viejos →</Link>
          </nav>
        )}
      </main>
    </>
  );
}

export default function HistorialPage(props: PageProps<"/admin/historial">) {
  return (
    <Suspense fallback={<Loading />}>
      <History {...props} />
    </Suspense>
  );
}
