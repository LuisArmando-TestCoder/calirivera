import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/server";
import { COLLECTION_DEFS, isContentCollection, publicUrl } from "@/lib/cms/config";
import { dynamicOptions, getDoc, titleOf } from "@/lib/cms/write";
import { DocForm } from "@/components/cms/admin/DocForm";
import { AdminHeader, fmtDate, PageHead } from "./ui";
import s from "@/components/cms/admin/admin.module.scss";

export async function Editor({ collection, id }: { collection: string; id: string | null }) {
  if (!isContentCollection(collection)) notFound();
  const def = COLLECTION_DEFS[collection];
  await requireAdmin(`/admin/${collection}/${id ?? "nuevo"}`);
  const doc = id ? await getDoc(collection, id) : null;
  if (id && !doc && !def.singleton) notFound();
  const dyn = await dynamicOptions(collection);
  const initial: Record<string, unknown> = doc ?? (collection === "posts" ? { publishedAt: new Date().toISOString() } : {});
  const title = doc ? titleOf(collection, doc) : `${def.gender === "f" ? "Nueva" : "Nuevo"} ${def.singular}`;
  const status = doc ? ((doc.status as "draft" | "published" | undefined) ?? "published") : null;
  return (
    <>
      <AdminHeader />
      <main className={s.main}>
        <PageHead
          title={title}
          crumbs={[
            { href: "/admin", label: "Inicio" },
            ...(def.singleton ? [] : [{ href: `/admin/${collection}`, label: def.label }]),
          ]}
          lead={doc?.updatedAt ? `Último cambio: ${fmtDate(doc.updatedAt)}` : undefined}
        />
        {doc?.trashed ? (
          <p className={s.empty}>Esto está en la papelera. Recuperalo desde la Papelera para editarlo.</p>
        ) : (
          <DocForm
            key={String(doc?.updatedAt ?? "new")}
            collection={collection}
            id={doc ? (id ?? def.singleton ?? null) : def.singleton ? def.singleton : null}
            initial={initial}
            status={status}
            dynOptions={dyn}
            publicHref={doc ? publicUrl(collection, doc as { id: string; slug?: string; kind?: string }) : null}
          />
        )}
      </main>
    </>
  );
}
