"use client";
import { useState } from "react";
import type { Block, ImageAsset, LayoutPreset, Section } from "@/lib/content/types";
import { BLOCK_TYPES, LAYOUT_OPTIONS, TONE_OPTIONS } from "@/lib/cms/config";
import { newId } from "@/lib/cms/validate";
import { previewFor } from "../shared/imageClient";
import { Confirm } from "../shared/Sheet";
import { ImageInput, ImagesInput } from "./fields";
import s from "./admin.module.scss";

type AnyBlock = Partial<Block> & { type: Block["type"]; id: string } & Record<string, unknown>;

export function emptyBlock(type: Block["type"]): AnyBlock {
  const id = newId();
  if ((type as string) === "video") return { type, id, url: "", title: "" };
  switch (type) {
    case "heading":
      return { type, id, level: 2, text: "" };
    case "paragraph":
      return { type, id, text: "" };
    case "quote":
      return { type, id, text: "", cite: "" };
    case "poem":
      return { type, id, title: "", author: "", lines: [] };
    case "image":
      return { type, id, caption: "" };
    case "gallery":
      return { type, id, images: [], caption: "" };
  }
}

function BlockPreview({ b }: { b: AnyBlock }) {
  if ((b.type as string) === "video") return <p className={s.pvText}>▶ {String(b.title || b.url || "Enlace de video…")}</p>;
  switch (b.type) {
    case "heading":
      return <p className={s.pvHeading} data-level={String(b.level ?? 2)}>{String(b.text || "Título…")}</p>;
    case "paragraph":
      return <p className={s.pvText}>{String(b.text || "Escribí el párrafo…")}</p>;
    case "quote":
      return (
        <blockquote className={s.pvQuote}>
          <p>“{String(b.text || "La cita…")}”</p>
          {b.cite ? <cite>— {String(b.cite)}</cite> : null}
        </blockquote>
      );
    case "poem": {
      const lines = (b.lines as string[] | undefined) ?? [];
      return (
        <div className={s.pvPoem}>
          {b.title ? <p className={s.pvPoemTitle}>{String(b.title)}</p> : null}
          {(lines.length ? lines : ["Los versos…"]).map((l, i) => (
            <p key={i}>{l || " "}</p>
          ))}
          {b.author ? <p className={s.pvPoemAuthor}>— {String(b.author)}</p> : null}
        </div>
      );
    }
    case "image": {
      const img = b.image as ImageAsset | undefined;
      return img?.src ? (
        <figure className={s.pvFigure}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewFor(img.src)} alt={img.alt} />
          {b.caption ? <figcaption>{String(b.caption)}</figcaption> : null}
        </figure>
      ) : null;
    }
    case "gallery": {
      const imgs = (b.images as ImageAsset[] | undefined) ?? [];
      return imgs.length ? (
        <div className={s.pvGallery}>
          {imgs.slice(0, 6).map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={previewFor(img.src)} alt={img.alt} />
          ))}
        </div>
      ) : null;
    }
  }
  return null;
}

function BlockFields({ b, set, errorsPrefix, errors }: { b: AnyBlock; set: (patch: Record<string, unknown>) => void; errorsPrefix: string; errors: Record<string, string> }) {
  const err = (k: string) => errors[`${errorsPrefix}.${k}`];
  const text = (k: string, label: string, opts: { rows?: number; max?: number; placeholder?: string } = {}) => {
    const v = String(b[k] ?? "");
    return (
      <label className={s.field}>
        <span>
          {label}
          {opts.max && <small className={s.counterInline}> {v.length}/{opts.max}</small>}
        </span>
        {opts.rows ? (
          <textarea rows={opts.rows} value={v} maxLength={opts.max} placeholder={opts.placeholder} onChange={(e) => set({ [k]: e.target.value })} />
        ) : (
          <input value={v} maxLength={opts.max} placeholder={opts.placeholder} onChange={(e) => set({ [k]: e.target.value })} />
        )}
        {err(k) && <small className={s.fieldError}>{err(k)}</small>}
      </label>
    );
  };
  if ((b.type as string) === "video")
    return (
      <div className={s.stack}>
        {text("url", "Enlace del video (YouTube o Vimeo)", { max: 300 })}
        {text("title", "Título (opcional)", { max: 160 })}
        <small>Subí el video a YouTube o Vimeo y pegá acá el enlace: el sitio lo muestra con su reproductor.</small>
      </div>
    );
  switch (b.type) {
    case "heading":
      return (
        <div className={s.stack}>
          {text("text", "Título", { max: 200 })}
          <fieldset className={s.inlineChoices}>
            <legend>Tamaño</legend>
            {[
              [2, "Grande"],
              [3, "Mediano"],
              [4, "Pequeño"],
            ].map(([lvl, label]) => (
              <label key={lvl} data-on={Number(b.level ?? 2) === lvl ? "" : undefined}>
                <input type="radio" checked={Number(b.level ?? 2) === lvl} onChange={() => set({ level: lvl })} />
                {label}
              </label>
            ))}
          </fieldset>
        </div>
      );
    case "paragraph":
      return text("text", "Texto", { rows: 6, max: 8000 });
    case "quote":
      return (
        <div className={s.stack}>
          {text("text", "Cita", { rows: 3, max: 2000 })}
          {text("cite", "¿De quién es?", { max: 160, placeholder: "Alfonso Chase, La Prensa Libre, 2009" })}
        </div>
      );
    case "poem":
      return (
        <div className={s.stack}>
          {text("title", "Título del poema", { max: 160 })}
          <label className={s.field}>
            <span>Versos (uno por línea; dejá una línea vacía entre estrofas)</span>
            <textarea
              rows={8}
              className={s.poemInput}
              value={((b.lines as string[] | undefined) ?? []).join("\n")}
              onChange={(e) => set({ lines: e.target.value.split("\n") })}
            />
            {err("lines") && <small className={s.fieldError}>{err("lines")}</small>}
          </label>
          {text("author", "Autor/a", { max: 120 })}
        </div>
      );
    case "image":
      return (
        <div className={s.stack}>
          <ImageInput value={b.image as ImageAsset | undefined} onChange={(v) => set({ image: v })} />
          {err("image") && <small className={s.fieldError}>{err("image")}</small>}
          {text("caption", "Pie de foto", { max: 300 })}
        </div>
      );
    case "gallery":
      return (
        <div className={s.stack}>
          <ImagesInput value={(b.images as ImageAsset[]) ?? []} onChange={(v) => set({ images: v })} />
          {err("images") && <small className={s.fieldError}>{err("images")}</small>}
          {text("caption", "Pie de galería", { max: 300 })}
        </div>
      );
  }
  return null;
}

export function BlocksEditor({
  value,
  onChange,
  path,
  errors,
}: {
  value: AnyBlock[];
  onChange: (v: AnyBlock[]) => void;
  path: string;
  errors: Record<string, string>;
}) {
  const blocks = value ?? [];
  const [confirm, setConfirm] = useState<number | null>(null);
  const update = (i: number, patch: Record<string, unknown>) => onChange(blocks.map((b, k) => (k === i ? { ...b, ...patch } : b)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = blocks.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = (type: Block["type"], at = blocks.length) => {
    const next = blocks.slice();
    next.splice(at, 0, emptyBlock(type));
    onChange(next);
  };
  return (
    <div className={s.blocks}>
      {blocks.length === 0 && <p className={s.help}>Todavía no hay contenido. Agregá un bloque abajo.</p>}
      {blocks.map((b, i) => {
        const meta = BLOCK_TYPES.find((t) => t.value === b.type);
        return (
          <section key={b.id} className={s.blockCard} aria-label={`${meta?.label ?? b.type} ${i + 1}`}>
            <header className={s.blockHead}>
              <span className={s.blockType}>
                <span aria-hidden>{meta?.icon}</span> {meta?.label}
              </span>
              <div className={s.itemTools}>
                <button type="button" className={s.toolBtn} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">
                  ↑
                </button>
                <button type="button" className={s.toolBtn} onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Bajar">
                  ↓
                </button>
                <button type="button" className={s.toolBtnDanger} onClick={() => setConfirm(i)} aria-label="Eliminar bloque">
                  ×
                </button>
              </div>
            </header>
            <BlockFields b={b} set={(p) => update(i, p)} errorsPrefix={`${path}.${i}`} errors={errors} />
            <div className={s.preview} aria-label="Vista previa">
              <span className={s.previewLabel}>Así se verá</span>
              <BlockPreview b={b} />
            </div>
          </section>
        );
      })}
      <div className={s.addBar} role="group" aria-label="Agregar bloque">
        <span className={s.addBarLabel}>Agregar:</span>
        {BLOCK_TYPES.map((t) => (
          <button key={t.value} type="button" className={s.addChip} onClick={() => add(t.value as Block["type"])}>
            <span aria-hidden>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>
      <Confirm
        open={confirm !== null}
        title="¿Eliminar este bloque?"
        body={<p>Podés deshacerlo con el botón «Deshacer» antes de guardar.</p>}
        confirmLabel="Eliminar"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm !== null && onChange(blocks.filter((_, k) => k !== confirm))}
      />
    </div>
  );
}

type AnySection = Omit<Partial<Section>, "blocks"> & { id: string; blocks: AnyBlock[]; layout?: LayoutPreset };

export function LayoutPicker({ value, onChange }: { value: LayoutPreset; onChange: (v: LayoutPreset) => void }) {
  return (
    <fieldset className={s.layoutPicker}>
      <legend>Estilo de diagramación</legend>
      {LAYOUT_OPTIONS.map((o) => (
        <label key={o.value} className={s.layoutOption} data-on={value === o.value ? "" : undefined}>
          <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} />
          <span className={s.layoutThumb} data-layout={o.value} aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>{o.label}</strong>
            <small>{o.hint}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function SectionsEditor({ value, onChange, path, errors }: { value: AnySection[]; onChange: (v: AnySection[]) => void; path: string; errors: Record<string, string> }) {
  const sections = value ?? [];
  const [confirm, setConfirm] = useState<number | null>(null);
  const update = (i: number, patch: Partial<AnySection>) => onChange(sections.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= sections.length) return;
    const next = sections.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className={s.stack}>
      {sections.map((sec, i) => (
        <details key={sec.id} className={s.sectionCard} open={sections.length <= 3}>
          <summary>
            <span className={s.sectionNum}>{i + 1}</span>
            <span className={s.sectionTitle}>{sec.title || `Sección ${i + 1}`}</span>
            <span className={s.sectionMeta}>{LAYOUT_OPTIONS.find((l) => l.value === (sec.layout ?? "auto"))?.label}</span>
          </summary>
          <div className={s.stack}>
            <div className={s.itemTools} style={{ justifyContent: "flex-end" }}>
              <button type="button" className={s.toolBtn} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir sección">
                ↑
              </button>
              <button type="button" className={s.toolBtn} onClick={() => move(i, 1)} disabled={i === sections.length - 1} aria-label="Bajar sección">
                ↓
              </button>
              <button type="button" className={s.toolBtnDanger} onClick={() => setConfirm(i)} aria-label="Eliminar sección">
                ×
              </button>
            </div>
            <label className={s.field}>
              <span>Título de la sección (opcional)</span>
              <input value={sec.title ?? ""} maxLength={160} onChange={(e) => update(i, { title: e.target.value })} />
            </label>
            <LayoutPicker value={sec.layout ?? "auto"} onChange={(layout) => update(i, { layout })} />
            <label className={s.field}>
              <span>Fondo</span>
              <select value={sec.tone ?? ""} onChange={(e) => update(i, { tone: (e.target.value || undefined) as Section["tone"] })}>
                <option value="">Automático</option>
                {TONE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={s.field}>
              <span>
                <input type="checkbox" role="switch" checked={sec.marks === true} onChange={(e) => update(i, { marks: e.target.checked || undefined })} />{" "}
                Resaltar fechas, lugares y obras
              </span>
            </label>
            <BlocksEditor value={sec.blocks ?? []} onChange={(blocks) => update(i, { blocks })} path={`${path}.${i}.blocks`} errors={errors} />
          </div>
        </details>
      ))}
      <button type="button" className={s.btnWide} onClick={() => onChange([...sections, { id: newId("s"), layout: "auto", blocks: [] }])}>
        ＋ Agregar sección
      </button>
      <Confirm
        open={confirm !== null}
        title="¿Eliminar esta sección completa?"
        body={<p>Se borra con todo su contenido. Podés deshacerlo antes de guardar.</p>}
        confirmLabel="Eliminar sección"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm !== null && onChange(sections.filter((_, k) => k !== confirm))}
      />
    </div>
  );
}
