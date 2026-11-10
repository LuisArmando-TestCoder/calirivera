"use client";
import type { ImageAsset } from "@/lib/content/types";

export type Focal = { x: number; y: number };
export type UploadedImage = ImageAsset & { focal?: Focal };

const MAX_EDGE = 2400;

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

/**
 * Crops around the focal point (when an aspect is chosen), fits in 2400 px and
 * re-encodes as JPEG so phone photos (often 5–12 MB) upload fast.
 */
export async function prepareImage(file: File, opts: { aspect?: number | null; focal?: Focal } = {}): Promise<Blob> {
  let src: ImageBitmap | HTMLImageElement;
  try {
    src = await decode(file);
  } catch {
    return file; // let the server try (e.g. formats the browser can't draw)
  }
  const w = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h = "naturalHeight" in src ? src.naturalHeight : src.height;
  let sx = 0,
    sy = 0,
    sw = w,
    sh = h;
  if (opts.aspect && opts.aspect > 0) {
    const focal = opts.focal ?? { x: 0.5, y: 0.5 };
    if (w / h > opts.aspect) {
      sw = Math.round(h * opts.aspect);
      sx = Math.round(Math.min(Math.max(focal.x * w - sw / 2, 0), w - sw));
    } else {
      sh = Math.round(w / opts.aspect);
      sy = Math.round(Math.min(Math.max(focal.y * h - sh / 2, 0), h - sh));
    }
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  if ("close" in src) src.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  return blob ?? file;
}

export interface UploadResult {
  asset: UploadedImage;
  pending: boolean;
  /** Local object URL to preview the image before the server copy is live. */
  previewUrl: string;
}

export function uploadImage(
  blob: Blob,
  meta: { alt: string; name: string; focal?: Focal },
  onProgress?: (fraction: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", blob, meta.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg");
    fd.append("alt", meta.alt);
    fd.append("name", meta.name);
    if (meta.focal) {
      fd.append("focalX", String(meta.focal.x));
      fd.append("focalY", String(meta.focal.y));
    }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/cms/media");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onerror = () => reject(new Error("Sin conexión. Probá de nuevo."));
    xhr.onload = () => {
      let body: { asset?: UploadedImage; pending?: boolean; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body.asset)
        resolve({ asset: body.asset, pending: Boolean(body.pending), previewUrl: URL.createObjectURL(blob) });
      else reject(new Error(body.error ?? "No se pudo subir la foto."));
    };
    xhr.send(fd);
  });
}

/** src → local preview URL, so images that are still deploying (GitHub store) show right away. */
const previews = new Map<string, string>();
export const rememberPreview = (src: string, url: string) => previews.set(src, url);
export const previewFor = (src: string | undefined) => (src ? (previews.get(src) ?? src) : "");
