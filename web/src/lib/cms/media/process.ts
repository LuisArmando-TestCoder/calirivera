import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { ImageAsset } from "@/lib/content/types";
import { slugify } from "../slug";

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_EDGE = 2400;

export interface ProcessedImage {
  data: Buffer;
  contentType: "image/webp";
  relPath: string;
  asset: Omit<ImageAsset, "src" | "alt">;
}

/** Rotates by EXIF, strips metadata, fits in 2400px, WebP q82 + tiny blur placeholder. */
export async function processImage(input: Buffer, originalName: string): Promise<ProcessedImage> {
  const img = sharp(input, { failOn: "error", limitInputPixels: 80_000_000 }).rotate();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new Error("No parece una imagen");
  const data = await img
    .clone()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  const tiny = await img.clone().resize(20, 20, { fit: "inside" }).webp({ quality: 40 }).toBuffer();
  // Orientation-corrected dimensions
  const swap = (meta.orientation ?? 1) >= 5;
  const origW = swap ? meta.height : meta.width;
  const origH = swap ? meta.width : meta.height;
  const hash = createHash("sha1").update(data.data).digest("hex").slice(0, 8);
  const d = new Date();
  const name = slugify(originalName.replace(/\.[a-z0-9]+$/i, ""), 50) || "imagen";
  return {
    data: data.data,
    contentType: "image/webp",
    relPath: `media/uploads/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${name}-${hash}.webp`,
    asset: {
      width: data.info.width,
      height: data.info.height,
      placeholder: `data:image/webp;base64,${tiny.toString("base64")}`,
      ...(Math.max(origW, origH) < 1000 ? { lowRes: true } : {}),
    },
  };
}
