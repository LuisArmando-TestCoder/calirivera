"use client";
import { useMemo, useState } from "react";
import { COLLECTION_DEFS, collectionForItemType, type FieldDef } from "@/lib/cms/config";
import type { ImageAsset } from "@/lib/content/types";
import { BlocksEditor } from "../admin/BlocksEditor";
import { ImageInput, ImagesInput, toDateInput } from "../admin/fields";
import { Sheet } from "../shared/Sheet";
import s from "../shared/shared.module.scss";
import a from "../admin/admin.module.scss";

export type NewItem =
  | { kind: "doc"; collection: string; value: Record<string, unknown> }
  | { kind: "values"; values: unknown[] };

const PROGRAM_BY_PATH: Record<string, string> = {
  "/la-incubadora": "incubadora",
  "/jovenes-talentos": "jovenes-talentos",
  "/colaboracion-al-artista-nacional": "colaboracion",
};

/** Short form shown by the "+" of an EditableList. */
type ItemSheetProps = { open: boolean; itemType: string; onClose: () => void; onDone: (item: NewItem) => void };

export function ItemSheet(props: ItemSheetProps) {
  return <ItemSheetInner key={props.open ? `open:${props.itemType}` : "closed"} {...props} />;
}

function initialValues(collection: string | null): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  const program = PROGRAM_BY_PATH[window.location.pathname];
  const init: Record<string, unknown> = {};
  if (collection === "posts") init.publishedAt = toDateInput(new Date().toISOString());
  if (program && collection === "people") init.programKinds = [program];
  if (program && collection === "posts") init.programKind = program;
  return init;
}

function ItemSheetInner({ open, itemType, onClose, onDone }: ItemSheetProps) {
  const collection = collectionForItemType(itemType);
  const def = collection ? COLLECTION_DEFS[collection] : null;
  const fields = useMemo(() => (def ? def.fields.filter((f) => f.quick) : []), [def]);
  const [vals, setVals] = useState<Record<string, unknown>>(() => initialValues(collection));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [blocks, setBlocks] = useState<any[]>([]);
  const [simple, setSimple] = useState<{ label?: string; href?: string; text?: string }>({});
  const [error, setError] = useState("");

  const submit = () => {
    setError("");
    if (def) {
      const missing = fields.find((f) => f.required && (vals[f.name] === undefined || vals[f.name] === "" || (Array.isArray(vals[f.name]) && !(vals[f.name] as unknown[]).length)));
      if (missing) return setError(`Falta: ${missing.label}`);
      return onDone({ kind: "doc", collection: def.name, value: vals });
    }
    if (itemType === "block") {
      if (!blocks.length) return setError("Agregá al menos un bloque.");
      return onDone({ kind: "values", values: blocks });
    }
    if (itemType === "link") {
      if (!simple.href) return setError("Falta la dirección.");
      return onDone({ kind: "values", values: [{ label: simple.label || simple.href, href: simple.href }] });
    }
    if (!simple.text?.trim()) return setError("Escribí algo primero.");
    return onDone({ kind: "values", values: [simple.text.trim()] });
  };

  const title = def ? `${def.gender === "f" ? "Nueva" : "Nuevo"} ${def.singular}` : itemType === "block" ? "Agregar contenido" : "Agregar";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      wide={itemType === "block"}
      footer={
        <>
          <button type="button" className={s.btn} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={s.btnPrimary} onClick={submit}>
            Agregar
          </button>
        </>
      }
    >
      {def &&
        fields.map((f) => <QuickField key={f.name} f={f} value={vals[f.name]} onChange={(v) => setVals((x) => ({ ...x, [f.name]: v }))} />)}
      {def && <p className={s.hint}>Después podés completar el resto desde el panel.</p>}
      {!def && itemType === "block" && <BlocksEditor value={blocks} onChange={setBlocks} path="new" errors={{}} />}
      {!def && itemType === "link" && (
        <>
          <label className={s.field}>
            <span>Texto</span>
            <input value={simple.label ?? ""} onChange={(e) => setSimple({ ...simple, label: e.target.value })} />
          </label>
          <label className={s.field}>
            <span>Dirección</span>
            <input inputMode="url" placeholder="https://…" value={simple.href ?? ""} onChange={(e) => setSimple({ ...simple, href: e.target.value })} />
          </label>
        </>
      )}
      {!def && itemType !== "block" && itemType !== "link" && (
        <label className={s.field}>
          <span>Texto</span>
          <textarea rows={3} value={simple.text ?? ""} onChange={(e) => setSimple({ text: e.target.value })} />
        </label>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}

function QuickField({ f, value, onChange }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const label = (
    <span>
      {f.label}
      {f.required ? " *" : ""}
    </span>
  );
  switch (f.type) {
    case "text":
    case "url":
      return (
        <label className={s.field}>
          {label}
          <input value={String(value ?? "")} maxLength={f.max} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
        </label>
      );
    case "textarea":
      return (
        <label className={s.field}>
          {label}
          <textarea rows={3} value={String(value ?? "")} maxLength={f.max} onChange={(e) => onChange(e.target.value)} />
        </label>
      );
    case "date":
      return (
        <label className={s.field}>
          {label}
          <input type="date" value={toDateInput(value)} onChange={(e) => onChange(e.target.value)} />
        </label>
      );
    case "select":
      return (
        <label className={s.field}>
          {label}
          <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
            <option value="">Elegí…</option>
            {(f.options ?? []).filter((o) => o.value).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className={s.field}>
          {label}
          <div className={a.toggleGroup}>
            {(f.options ?? []).map((o) => {
              const on = arr.includes(o.value);
              return (
                <button key={o.value} type="button" className={a.toggle} aria-pressed={on} onClick={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}>
                  {on ? "✓ " : ""}
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    case "image":
      return (
        <div className={s.field}>
          {label}
          <ImageInput value={value as ImageAsset | undefined} onChange={onChange} label={f.label} />
        </div>
      );
    case "images":
      return (
        <div className={s.field}>
          {label}
          <ImagesInput value={(value as ImageAsset[]) ?? []} onChange={onChange} />
        </div>
      );
    default:
      return null;
  }
}
