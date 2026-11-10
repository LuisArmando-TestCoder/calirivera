"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ImageAsset } from "@/lib/content/types";
import { COLLECTION_DEFS, type ContentCollection, type FieldDef } from "@/lib/cms/config";
import { getAt, setAt } from "@/lib/cms/paths";
import { slugify } from "@/lib/cms/slug";
import { validateDoc } from "@/lib/cms/validate";
import { revertAction, saveDocAction, setStatusAction, trashDocAction, restoreDocAction } from "@/app/admin/actions";
import { useToast } from "../shared/Toaster";
import { Confirm } from "../shared/Sheet";
import { BlocksEditor, SectionsEditor } from "./BlocksEditor";
import { Counter, FieldShell, ImageInput, ImagesInput, LinksInput, toDateInput, type Opt } from "./fields";
import s from "./admin.module.scss";

type Values = Record<string, unknown>;

export function DocForm({
  collection,
  id,
  initial,
  status,
  dynOptions,
  publicHref,
}: {
  collection: ContentCollection;
  id: string | null;
  initial: Values;
  status: "draft" | "published" | null;
  dynOptions: Record<string, Opt[]>;
  publicHref: string | null;
}) {
  const def = COLLECTION_DEFS[collection];
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<Values>(initial);
  const [past, setPast] = useState<Values[]>([]);
  const lastKey = useRef<{ key: string; at: number } | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [confirmTrash, setConfirmTrash] = useState(false);

  const optionValues = useMemo(() => Object.fromEntries(Object.entries(dynOptions).map(([k, v]) => [k, v.map((o) => o.value)])), [dynOptions]);
  const { errors } = useMemo(() => validateDoc(def, values, optionValues), [def, values, optionValues]);
  const visibleErrors = showErrors ? { ...errors, ...serverErrors } : serverErrors;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const valuesRef = useRef(values);
  const set = useCallback((name: string, v: unknown, coalesce = true) => {
    const cur = valuesRef.current;
    const now = Date.now();
    const same = coalesce && lastKey.current?.key === name && now - lastKey.current.at < 1200;
    if (!same) setPast((p) => [...p.slice(-49), cur]);
    lastKey.current = { key: name, at: now };
    const next = setAt(cur, name.split("."), v);
    valuesRef.current = next;
    setValues(next);
    setDirty(true);
    setServerErrors((e) => {
      if (!(name in e)) return e;
      const rest = { ...e };
      delete rest[name];
      return rest;
    });
  }, []);

  const undo = () => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    valuesRef.current = prev;
    lastKey.current = null;
    setValues(prev);
    setPast(past.slice(0, -1));
  };

  const save = (intent: "keep" | "publish" | "draft") =>
    start(async () => {
      setShowErrors(true);
      if (Object.keys(errors).length && intent !== "draft") {
        toast({ text: "Revisá los campos marcados en rojo.", tone: "error" });
        document.querySelector("[data-invalid]")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const r = await saveDocAction(collection, id, values, intent);
      if (!r.ok) {
        setServerErrors(("errors" in r && r.errors) || {});
        toast({ text: r.error ?? "No se pudo guardar.", tone: "error" });
        return;
      }
      setDirty(false);
      setPast([]);
      lastKey.current = null;
      const auditId = "auditId" in r ? r.auditId : undefined;
      toast({
        text: intent === "publish" ? "Publicado ✓" : r.status === "published" ? "Cambios publicados ✓" : "Borrador guardado ✓",
        tone: "ok",
        action: auditId
          ? {
              label: "Deshacer",
              run: async () => {
                const u = await revertAction(auditId);
                toast({ text: u.ok ? "Listo, quedó como antes." : (u.error ?? "No se pudo deshacer"), tone: u.ok ? "info" : "error" });
                router.refresh();
              },
            }
          : undefined,
      });
      if (!id && "id" in r && r.id) router.replace(`/admin/${collection}/${r.id}`);
      else router.refresh();
    });

  const isNew = !id;
  const published = status === "published";

  return (
    <form
      className={s.docForm}
      onSubmit={(e) => {
        e.preventDefault();
        save(published ? "keep" : "draft");
      }}
    >
      <div className={s.formStatus}>
        <span className={s.pill} data-status={status ?? "new"}>
          {isNew ? (def.gender === "f" ? "Nueva" : "Nuevo") : published ? "Publicado" : "Borrador"}
        </span>
        {publicHref && published && (
          <a className={s.btnSmallGhost} href={publicHref} target="_blank" rel="noreferrer">
            Ver en el sitio ↗
          </a>
        )}
      </div>

      {def.fields.map((f) => (
        <FieldInput key={f.name} f={f} values={values} set={set} errors={visibleErrors} dyn={dynOptions[f.name]} isNew={isNew} collection={collection} />
      ))}

      {!isNew && !def.singleton && (
        <div className={s.dangerZone}>
          {published && (
            <button type="button" className={s.btnSmallGhost} disabled={pending} onClick={() => start(async () => {
              const r = await setStatusAction(collection, id!, "draft");
              toast({ text: r.ok ? "Ahora es un borrador (no se ve en el sitio)." : (r.error ?? "Error"), tone: r.ok ? "info" : "error" });
              router.refresh();
            })}>
              Pasar a borrador
            </button>
          )}
          <button type="button" className={s.btnSmallDanger} onClick={() => setConfirmTrash(true)}>
            Mover a la papelera
          </button>
        </div>
      )}

      <div className={s.actionBar}>
        <button type="button" className={s.btnUndo} onClick={undo} disabled={!past.length || pending} aria-label="Deshacer el último cambio">
          <span aria-hidden>↶</span>
          <span className={s.hideSm}>Deshacer</span>
        </button>
        {published ? (
          <button type="button" className={s.btnPrimary} disabled={pending || !dirty} onClick={() => save("keep")}>
            {pending ? "Guardando…" : "Guardar y publicar"}
          </button>
        ) : (
          <>
            <button type="button" className={s.btn} disabled={pending} onClick={() => save("draft")}>
              {pending ? "…" : (
                <>
                  Guardar<span className={s.hideSm}>&nbsp;borrador</span>
                </>
              )}
            </button>
            <button type="button" className={s.btnPrimary} disabled={pending} onClick={() => save("publish")}>
              {pending ? "Publicando…" : "Publicar"}
            </button>
          </>
        )}
      </div>

      <Confirm
        open={confirmTrash}
        title={`¿Mover «${String(getAt(values, def.titleField.split(".")) ?? "esto")}» a la papelera?`}
        body={<p>Deja de verse en el sitio. Lo podés recuperar desde la Papelera.</p>}
        confirmLabel="Mover a la papelera"
        danger
        onClose={() => setConfirmTrash(false)}
        onConfirm={() =>
          start(async () => {
            const r = await trashDocAction(collection, id!);
            if (!r.ok) return toast({ text: r.error ?? "Error", tone: "error" });
            setDirty(false);
            toast({
              text: "Movido a la papelera.",
              action: { label: "Deshacer", run: async () => void (await restoreDocAction(collection, id!), router.push(`/admin/${collection}/${id}`)) },
            });
            router.push(`/admin/${collection}`);
          })
        }
      />
    </form>
  );
}

function FieldInput({
  f,
  values,
  set,
  errors,
  dyn,
  isNew,
  collection,
}: {
  f: FieldDef;
  values: Values;
  set: (name: string, v: unknown, coalesce?: boolean) => void;
  errors: Record<string, string>;
  dyn?: Opt[];
  isNew: boolean;
  collection: ContentCollection;
}) {
  const v = getAt(values, f.name.split("."));
  const err = errors[f.name];
  const id = `f-${f.name}`;
  const locked = f.lockedAfterCreate && !isNew;

  switch (f.type) {
    case "text":
    case "url": {
      const str = String(v ?? "");
      return (
        <FieldShell f={f} error={err} aside={<Counter n={str.length} max={f.max} />}>
          <input id={id} className={s.input} type={f.type === "url" ? "url" : "text"} inputMode={f.type === "url" ? "url" : undefined} value={str} placeholder={f.placeholder} disabled={locked} onChange={(e) => set(f.name, e.target.value)} />
        </FieldShell>
      );
    }
    case "textarea": {
      const str = String(v ?? "");
      return (
        <FieldShell f={f} error={err} aside={<Counter n={str.length} max={f.max} />}>
          <textarea id={id} className={s.input} rows={f.rows ?? 4} value={str} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />
        </FieldShell>
      );
    }
    case "slug": {
      const titleField = COLLECTION_DEFS[collection].titleField;
      const auto = slugify(String(getAt(values, titleField.split(".")) ?? ""));
      const str = String(v ?? "");
      return (
        <FieldShell f={f} error={err}>
          {locked ? (
            <p className={s.slugView}>/{str}</p>
          ) : (
            <input id={id} className={s.input} value={str} placeholder={auto || "se-crea-sola"} onChange={(e) => set(f.name, slugify(e.target.value))} />
          )}
        </FieldShell>
      );
    }
    case "number":
      return (
        <FieldShell f={f} error={err}>
          <input id={id} className={s.inputShort} type="number" inputMode="numeric" value={v === undefined || v === null ? "" : String(v)} onChange={(e) => set(f.name, e.target.value === "" ? undefined : Number(e.target.value))} />
        </FieldShell>
      );
    case "date":
      return (
        <FieldShell f={f} error={err}>
          <div className={s.row}>
            <input id={id} className={s.inputShort} type="date" value={toDateInput(v)} onChange={(e) => set(f.name, e.target.value)} />
            <button type="button" className={s.btnSmallGhost} onClick={() => set(f.name, toDateInput(new Date().toISOString()), false)}>
              Hoy
            </button>
          </div>
        </FieldShell>
      );
    case "select": {
      const opts = dyn ? [{ value: "", label: "Ninguna" }, ...dyn] : (f.options ?? []);
      return (
        <FieldShell f={f} error={err}>
          <select id={id} className={s.input} value={String(v ?? "")} disabled={locked} onChange={(e) => set(f.name, e.target.value, false)}>
            {!f.required || v ? null : <option value="">Elegí una opción…</option>}
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FieldShell>
      );
    }
    case "multiselect": {
      const arr = Array.isArray(v) ? (v as string[]) : [];
      return (
        <FieldShell f={f} error={err}>
          <div className={s.toggleGroup} role="group" aria-labelledby={id}>
            {(f.options ?? []).map((o) => {
              const on = arr.includes(o.value);
              return (
                <button key={o.value} type="button" className={s.toggle} aria-pressed={on} onClick={() => set(f.name, on ? arr.filter((x) => x !== o.value) : [...arr, o.value], false)}>
                  {on ? "✓ " : ""}
                  {o.label}
                </button>
              );
            })}
          </div>
        </FieldShell>
      );
    }
    case "boolean":
      return (
        <FieldShell f={f} error={err}>
          <label className={s.switch}>
            <input id={id} type="checkbox" role="switch" checked={v === true} onChange={(e) => set(f.name, e.target.checked, false)} />
            <span aria-hidden />
            {v === true ? "Sí" : "No"}
          </label>
        </FieldShell>
      );
    case "image":
      return (
        <FieldShell f={f} error={err}>
          <ImageInput value={v as ImageAsset | undefined} label={f.label} onChange={(img) => set(f.name, img, false)} />
        </FieldShell>
      );
    case "images":
      return (
        <FieldShell f={f} error={err}>
          <ImagesInput value={(v as ImageAsset[]) ?? []} onChange={(imgs) => set(f.name, imgs, false)} />
        </FieldShell>
      );
    case "blocks":
      return (
        <FieldShell f={f} error={err}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <BlocksEditor value={(v as any[]) ?? []} onChange={(b) => set(f.name, b, false)} path={f.name} errors={errors} />
        </FieldShell>
      );
    case "sections":
      return (
        <FieldShell f={f} error={err}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <SectionsEditor value={(v as any[]) ?? []} onChange={(x) => set(f.name, x, false)} path={f.name} errors={errors} />
        </FieldShell>
      );
    case "links":
      return (
        <FieldShell f={f} error={err}>
          <LinksInput value={(v as { label: string; href: string }[]) ?? []} onChange={(l) => set(f.name, l)} />
        </FieldShell>
      );
    case "tags": {
      const str = Array.isArray(v) ? (v as string[]).join(", ") : String(v ?? "");
      return (
        <FieldShell f={f} error={err}>
          <input id={id} className={s.input} value={str} placeholder="poesía, música, recital" onChange={(e) => set(f.name, e.target.value)} />
        </FieldShell>
      );
    }
  }
}
