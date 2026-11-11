import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/server";
import { COLLECTION_DEFS, isContentCollection } from "@/lib/cms/config";
import { getAt } from "@/lib/cms/paths";
import { listDocs, titleOf } from "@/lib/cms/write";
import type { ImageAsset } from "@/lib/content/types";
import { AdminHeader, fmtDay, Loading, PageHead } from "../ui";
import { QuickStatus } from "@/components/cms/admin/RowActions";
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
  const where: Record<string, string> = {};
  for (const f of def.filters ?? []) if (typeof sp[f.name] === "string" && sp[f.name]) where[f.name] = sp[f.name] as string;
  const res = await listDocs(collection, { q, status, page, per: 20, where });
  // Valores de filtros sin opciones fijas (p. ej. años): los que existen en la colección
  const filterOpts =
    def.filters?.some((f) => !f.options)
      ? await listDocs(collection, { status: "all", per: 100000 }).then((r) =>
          Object.fromEntries(
            (def.filters ?? [])
              .filter((f) => !f.options)
              .map((f) => [
                f.name,
                [...new Set(r.items.map((d) => String(d[f.name] ?? "")).filter(Boolean))]
                  .sort()
                  .map((v) => ({ value: v, label: v })),
              ]),
          ),
        )
      : {};
  const qs = (patch: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    const merged = { q, estado: status === "all" ? undefined : status, ...where, pagina: undefined as number | undefined, ...patch };
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
            {Object.entries(where).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
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
        {def.filters?.map((f) => {
          const opts = f.options ?? filterOpts[f.name] ?? [];
          if (!opts.length) return null;
          return (
            <nav key={f.name} className={s.tabs} aria-label={`Filtrar por ${f.label.toLowerCase()}`} data-filter>
              <span className={s.filterLabel}>{f.label}</span>
              <Link href={qs({ [f.name]: undefined })} aria-current={!where[f.name] ? "page" : undefined}>
                Todos
              </Link>
              {opts.map((o) => (
                <Link key={o.value} href={qs({ [f.name]: o.value })} aria-current={where[f.name] === o.value ? "page" : undefined}>
                  {o.label}
                </Link>
              ))}
            </nav>
          );
        })}
        {res.items.length === 0 ? (
          <p className={s.empty}>{q || Object.keys(where).length ? `No encontramos nada con esos filtros.` : `Todavía no hay ${def.label.toLowerCase()}.`}</p>
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
                  {collection === "memories" && (
                    <QuickStatus collection={collection} id={d.id} status={(d.status ?? "published") as "draft" | "published"} title={titleOf(collection, d)} />
                  )}
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
