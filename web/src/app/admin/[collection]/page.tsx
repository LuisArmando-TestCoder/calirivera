import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/server";
import { COLLECTION_DEFS, isContentCollection } from "@/lib/cms/config";
import { getAt } from "@/lib/cms/paths";
import { listDocs, titleOf } from "@/lib/cms/write";
import type { ImageAsset } from "@/lib/content/types";
import { AdminHeader, fmtDay, Loading, PageHead } from "../ui";
import s from "@/components/cms/admin/admin.module.scss";

const STATUS_TABS = [
  { v: "all", label: "Todo" },
  { v: "published", label: "Publicado" },
  { v: "draft", label: "Borradores" },
] as const;

async function List({ params, searchParams }: PageProps<"/admin/[collection]">) {
  const { collection } = await params;
  if (!isContentCollection(collection)) notFound();
  const def = COLLECTION_DEFS[collection];
  await requireAdmin(`/admin/${collection}`);
  if (def.singleton) {
    const { redirect } = await import("next/navigation");
    redirect(`/admin/${collection}/${def.singleton}`);
  }
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = (["all", "published", "draft"] as const).find((x) => x === sp.estado) ?? "all";
  const page = Number(sp.pagina) || 1;
  const res = await listDocs(collection, { q, status, page, per: 20 });
  const qs = (patch: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    const merged = { q, estado: status === "all" ? undefined : status, pagina: undefined as number | undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && v !== 1) u.set(k, String(v));
    const str = u.toString();
    return str ? `?${str}` : "";
  };
  const nuevo = def.gender === "f" ? "Nueva" : "Nuevo";

  return (
    <>
      <AdminHeader />
      <main className={s.main}>
        <PageHead title={def.label} lead={def.description} crumbs={[{ href: "/admin", label: "Inicio" }]}>
          <div className={s.row}>
            <Link href={`/admin/${collection}/nuevo`} className={s.btnPrimary}>
              ＋ {nuevo} {def.singular}
            </Link>
          </div>
        </PageHead>
        <div className={s.toolbar}>
          <form className={s.search} role="search" action="">
            <label htmlFor="q" className={s.srOnly}>
              Buscar
            </label>
            <input id="q" name="q" type="search" defaultValue={q} placeholder={`Buscar en ${def.label.toLowerCase()}…`} />
            {status !== "all" && <input type="hidden" name="estado" value={status} />}
            <button className={s.btn}>Buscar</button>
          </form>
          <nav className={s.tabs} aria-label="Filtrar por estado">
            {STATUS_TABS.map((t) => (
              <Link key={t.v} href={qs({ estado: t.v === "all" ? undefined : t.v })} aria-current={status === t.v ? "page" : undefined}>
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
        {res.items.length === 0 ? (
          <p className={s.empty}>{q ? `No encontramos nada con «${q}».` : `Todavía no hay ${def.label.toLowerCase()}.`}</p>
        ) : (
          <ul className={s.list}>
            {res.items.map((d) => {
              const img = def.imageField ? (getAt(d, def.imageField.split(".")) as ImageAsset | undefined) : undefined;
              const date = def.sort === "publishedAt" ? d.publishedAt : d.updatedAt;
              return (
                <li key={d.id}>
                  <Link href={`/admin/${collection}/${d.id}`} className={s.listItem}>
                    {img?.src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className={s.listThumb} src={img.src} alt="" loading="lazy" />
                    ) : (
                      <span className={s.listThumb} aria-hidden>
                        {def.icon}
                      </span>
                    )}
                    <span className={s.listBody}>
                      <span className={s.listTitle}>{titleOf(collection, d)}</span>
                      <span className={s.listMeta}>
                        <span className={s.pill} data-status={d.status ?? "published"}>
                          {(d.status ?? "published") === "published" ? "Publicado" : "Borrador"}
                        </span>
                        {d.aiAltered === true && <span className={s.pill}>Alterada con IA</span>}
                        <span>{fmtDay(date)}</span>
                      </span>
                    </span>
                    <span className={s.chev} aria-hidden>
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {res.pages > 1 && (
          <nav className={s.pager} aria-label="Páginas">
            {res.page > 1 ? <Link href={qs({ pagina: res.page - 1 })}>← Anterior</Link> : <i />}
            <span>
              Página {res.page} de {res.pages} · {res.total} en total
            </span>
            {res.page < res.pages ? <Link href={qs({ pagina: res.page + 1 })}>Siguiente →</Link> : <i />}
          </nav>
        )}
      </main>
    </>
  );
}

export default function CollectionList(props: PageProps<"/admin/[collection]">) {
  return (
    <Suspense fallback={<Loading />}>
      <List {...props} />
    </Suspense>
  );
}
