import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/server";
import { COLLECTION_DEFS, CONTENT_COLLECTIONS } from "@/lib/cms/config";
import { listDocs, titleOf } from "@/lib/cms/write";
import { TrashRowActions } from "@/components/cms/admin/RowActions";
import { AdminHeader, fmtDate, Loading, PageHead } from "../ui";
import s from "@/components/cms/admin/admin.module.scss";

async function Trash() {
  await requireAdmin("/admin/papelera");
  const groups = await Promise.all(
    CONTENT_COLLECTIONS.filter((c) => !COLLECTION_DEFS[c].singleton).map(async (c) => ({ c, items: (await listDocs(c, { status: "trash", per: 100 })).items })),
  );
  const any = groups.some((g) => g.items.length);
  return (
    <>
      <AdminHeader />
      <main className={s.main}>
        <PageHead title="Papelera" lead="Lo que mandaste a la papelera no se ve en el sitio. Podés recuperarlo." crumbs={[{ href: "/admin", label: "Inicio" }]} />
        {!any && <p className={s.empty}>La papelera está vacía.</p>}
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <section key={g.c}>
              <h2 className={s.sectionTitleH}>{COLLECTION_DEFS[g.c].label}</h2>
              <ul className={`${s.card} ${s.activity}`}>
                {g.items.map((d) => (
                  <li key={d.id}>
                    <span className={s.actWhat}>
                      <strong>{titleOf(g.c, d)}</strong>
                      <small>En la papelera desde {fmtDate(d.trashedAt)}</small>
                    </span>
                    <TrashRowActions collection={g.c} id={d.id} title={titleOf(g.c, d)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </main>
    </>
  );
}

export default function PapeleraPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Trash />
    </Suspense>
  );
}
