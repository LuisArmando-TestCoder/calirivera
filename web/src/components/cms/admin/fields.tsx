"use client";
import { useState } from "react";
import type { ImageAsset } from "@/lib/content/types";
import type { FieldDef } from "@/lib/cms/config";
import { ImageSheet } from "../shared/ImageSheet";
import { previewFor } from "../shared/imageClient";
import s from "./admin.module.scss";

export type Opt = { value: string; label: string };

export function toDateInput(v: unknown): string {
  if (typeof v !== "string" || !v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function Counter({ n, max }: { n: number; max?: number }) {
  if (!max) return null;
  return (
    <small className={s.counter} data-over={n > max ? "" : undefined} data-near={n > max * 0.9 ? "" : undefined}>
      {n}/{max}
    </small>
  );
}

export function FieldShell({ f, error, children, aside }: { f: FieldDef; error?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className={s.fieldBlock} data-invalid={error ? "" : undefined}>
      <div className={s.fieldHead}>
        <label className={s.label} htmlFor={`f-${f.name}`}>
          {f.label}
          {f.required && <span className={s.req} aria-label="obligatorio"> *</span>}
        </label>
        {aside}
      </div>
      {children}
      {f.help && <p className={s.help}>{f.help}</p>}
      {error && (
        <p className={s.fieldError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function ImageInput({ value, onChange, label = "Foto", askArtwork }: { value?: ImageAsset | null; onChange: (v: ImageAsset | undefined) => void; label?: string; askArtwork?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={s.imageInput}>
      {value?.src ? (
        <button type="button" className={s.thumbBtn} onClick={() => setOpen(true)} aria-label={`Cambiar ${label.toLowerCase()}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewFor(value.src)} alt={value.alt || ""} />
          {value.lowRes && <span className={s.badge}>Baja resolución</span>}
        </button>
      ) : (
        <button type="button" className={s.addImage} onClick={() => setOpen(true)}>
          <span aria-hidden>＋</span> Agregar foto
        </button>
      )}
      {value?.src && (
        <div className={s.imageMeta}>
          <p className={s.help}>{value.alt ? `“${value.alt}”` : "Sin descripción — tocá la foto para agregarla."}</p>
          <div className={s.row}>
            <button type="button" className={s.btnSmall} onClick={() => setOpen(true)}>
              Cambiar
            </button>
            <button type="button" className={s.btnSmallGhost} onClick={() => onChange(undefined)}>
              Quitar
            </button>
          </div>
        </div>
      )}
      <ImageSheet
        open={open}
        onClose={() => setOpen(false)}
        initial={value}
        title={label}
        askArtwork={askArtwork}
        onDone={(asset) => {
          onChange(asset);
          setOpen(false);
        }}
      />
    </div>
  );
}

export function ImagesInput({ value, onChange }: { value: ImageAsset[]; onChange: (v: ImageAsset[]) => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const list = value ?? [];
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className={s.imagesGrid}>
      {list.map((img, i) => (
        <figure key={img.src + i} className={s.imagesItem}>
          <button type="button" className={s.thumbBtn} onClick={() => setEditing(i)} aria-label={`Editar foto ${i + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewFor(img.src)} alt={img.alt || ""} />
            {i === 0 && <span className={s.badge}>Principal</span>}
          </button>
          <div className={s.itemTools}>
            <button type="button" className={s.toolBtn} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Mover antes">
              ←
            </button>
            <button type="button" className={s.toolBtn} onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Mover después">
              →
            </button>
            <button type="button" className={s.toolBtnDanger} onClick={() => onChange(list.filter((_, k) => k !== i))} aria-label="Quitar foto">
              ×
            </button>
          </div>
        </figure>
      ))}
      <button type="button" className={s.addImage} onClick={() => setEditing(-1)}>
        <span aria-hidden>＋</span> Agregar foto
      </button>
      <ImageSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        initial={editing !== null && editing >= 0 ? list[editing] : null}
        onDone={(asset) => {
          if (editing === null) return;
          onChange(editing >= 0 ? list.map((x, k) => (k === editing ? asset : x)) : [...list, asset]);
          setEditing(null);
        }}
      />
    </div>
  );
}

export function LinksInput({ value, onChange }: { value: { label: string; href: string }[]; onChange: (v: { label: string; href: string }[]) => void }) {
  const list = value ?? [];
  return (
    <div className={s.stack}>
      {list.map((l, i) => (
        <div key={i} className={s.linkRow}>
          <input aria-label="Texto" placeholder="Instagram" value={l.label} onChange={(e) => onChange(list.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
          <input aria-label="Dirección" placeholder="https://…" inputMode="url" value={l.href} onChange={(e) => onChange(list.map((x, k) => (k === i ? { ...x, href: e.target.value } : x)))} />
          <button type="button" className={s.toolBtnDanger} aria-label="Quitar enlace" onClick={() => onChange(list.filter((_, k) => k !== i))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className={s.btnSmall} onClick={() => onChange([...list, { label: "", href: "" }])}>
        ＋ Agregar enlace
      </button>
    </div>
  );
}
