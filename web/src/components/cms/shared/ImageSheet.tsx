"use client";
import { useEffect, useRef, useState } from "react";
import type { ImageAsset } from "@/lib/content/types";
import { prepareImage, previewFor, rememberPreview, uploadImage, type Focal, type UploadedImage } from "./imageClient";
import { Sheet } from "./Sheet";
import s from "./shared.module.scss";

const ASPECTS: { label: string; value: number | null }[] = [
  { label: "Como está", value: null },
  { label: "Cuadrada", value: 1 },
  { label: "Vertical", value: 4 / 5 },
  { label: "Horizontal", value: 3 / 2 },
  { label: "Panorámica", value: 16 / 9 },
];

export interface ArtworkMeta {
  title?: string;
  year?: string;
  technique?: string;
  dimensions?: string;
}

export function ImageSheet(props: ImageSheetProps) {
  // Remount on open so every opening starts clean.
  return <ImageSheetInner key={props.open ? "open" : "closed"} {...props} />;
}

interface ImageSheetProps {
  open: boolean;
  onClose: () => void;
  initial?: ImageAsset | null;
  onDone: (asset: UploadedImage, extra: { previewUrl?: string; pending?: boolean; artwork?: ArtworkMeta }) => void;
  title?: string;
  /** Show title/year/technique/dimensions (artworks). */
  askArtwork?: boolean;
}

function ImageSheetInner({
  open,
  onClose,
  initial,
  onDone,
  title = "Foto",
  askArtwork,
}: ImageSheetProps) {
  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string>("");
  const [alt, setAlt] = useState(initial?.alt ?? "");
  const [aspect, setAspect] = useState<number | null>(null);
  const [focal, setFocal] = useState<Focal>((initial as UploadedImage | undefined)?.focal ?? { x: 0.5, y: 0.5 });
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<ArtworkMeta>({});
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (localUrl && URL.revokeObjectURL(localUrl)), [localUrl]);

  const shown = localUrl || previewFor(initial?.src);
  const busy = progress !== null;

  async function confirm() {
    setError("");
    if (!file) {
      if (!initial) return setError("Elegí una foto primero.");
      onDone({ ...initial, alt: alt.trim(), focal }, { artwork: askArtwork ? meta : undefined });
      return;
    }
    try {
      setProgress(0);
      const blob = await prepareImage(file, { aspect, focal });
      const r = await uploadImage(blob, { alt: alt.trim(), name: file.name, focal }, setProgress);
      rememberPreview(r.asset.src, r.previewUrl);
      onDone(r.asset, { previewUrl: r.previewUrl, pending: r.pending, artwork: askArtwork ? meta : undefined });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      footer={
        <>
          <button type="button" className={s.btn} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className={s.btnPrimary} onClick={confirm} disabled={busy || (!file && !initial)}>
            {busy ? `Subiendo… ${Math.round((progress ?? 0) * 100)}%` : file ? "Usar esta foto" : "Listo"}
          </button>
        </>
      }
    >
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (localUrl) URL.revokeObjectURL(localUrl);
          setFile(f);
          setLocalUrl(URL.createObjectURL(f));
          setFocal({ x: 0.5, y: 0.5 });
          e.target.value = "";
        }}
      />
      {shown ? (
        <div className={s.focalBox}>
          <button
            type="button"
            className={s.focalImgBtn}
            aria-label="Tocá la parte más importante de la foto"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setFocal({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown} alt="" />
            <span className={s.focalDot} style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }} aria-hidden />
          </button>
          <p className={s.hint}>Tocá la parte más importante de la foto: así nunca se recorta.</p>
          {aspect && (
            <figure className={s.cropPreview}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shown} alt="" style={{ aspectRatio: String(aspect), objectPosition: `${focal.x * 100}% ${focal.y * 100}%` }} />
              <figcaption>Así queda</figcaption>
            </figure>
          )}
        </div>
      ) : (
        <button type="button" className={s.dropzone} onClick={() => input.current?.click()}>
          <span className={s.dropIcon} aria-hidden>
            ＋
          </span>
          Tomar o elegir una foto
        </button>
      )}

      {shown && (
        <button type="button" className={s.btnWide} onClick={() => input.current?.click()} disabled={busy}>
          {file || initial ? "Cambiar por otra foto" : "Elegir foto"}
        </button>
      )}

      {file && (
        <fieldset className={s.chips}>
          <legend>Recorte</legend>
          {ASPECTS.map((a) => (
            <label key={a.label} className={s.chip} data-on={aspect === a.value ? "" : undefined}>
              <input type="radio" name="aspect" checked={aspect === a.value} onChange={() => setAspect(a.value)} />
              {a.label}
            </label>
          ))}
        </fieldset>
      )}

      <label className={s.field}>
        <span>Describí la foto en una frase</span>
        <textarea rows={2} value={alt} maxLength={300} onChange={(e) => setAlt(e.target.value)} placeholder="Óleo de una mujer azul sosteniendo un cántaro" />
        <small className={s.hint}>Ayuda a personas ciegas y a Google. {alt.length}/300</small>
      </label>

      {askArtwork && file && (
        <div className={s.grid2}>
          <p className={s.hint} style={{ gridColumn: "1 / -1" }}>
            Datos de la obra (dejá vacío lo que no cambia):
          </p>
          {(
            [
              ["title", "Título", "Un corazón herido…"],
              ["year", "Año", "1996"],
              ["technique", "Técnica", "Óleo sobre tela"],
              ["dimensions", "Medidas", "120 × 90 cm"],
            ] as const
          ).map(([k, label, ph]) => (
            <label key={k} className={s.field}>
              <span>{label}</span>
              <input value={meta[k] ?? ""} placeholder={ph} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} />
            </label>
          ))}
        </div>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}
