import type { CSSProperties } from "react";
import { EditableImage, type FieldPath } from "@/components/cms/editable";
import type { ImageAsset } from "@/lib/content/types";
import s from "./ArtImage.module.scss";

/**
 * Imagen de obra: <picture> AVIF/WebP/JPEG con srcset (tools/optimize-media.mjs),
 * placeholder de color + blur, aspecto reservado (CLS 0).
 * El <img> es el EditableImage del contrato con el CMS.
 * lowRes → «zoom-out + copias desenfocadas»: la imagen se muestra a un tamaño que su
 * resolución aguanta, sobre una copia ampliada y desenfocada que llena el marco.
 */
export function ArtImage({
  image,
  path,
  sizes = "(min-width: 60em) 50vw, 100vw",
  priority = false,
  fit = "contain",
  className,
  frame = true,
}: {
  image: ImageAsset;
  path: FieldPath;
  sizes?: string;
  priority?: boolean;
  fit?: "contain" | "cover";
  className?: string;
  frame?: boolean;
}) {
  const w = image.width ?? 1200;
  const h = image.height ?? 1500;
  const style = {
    "--ratio": `${w} / ${h}`,
    "--tint": image.color ?? "var(--c-linea)",
    ...(image.placeholder ? { "--ph": `url("${image.placeholder}")` } : {}),
  } as CSSProperties;
  const srcset = (ext: string) =>
    image.widths?.length && /-\d+\.jpg$/.test(image.src)
      ? image.widths.map((wd) => `${image.src.replace(/-\d+\.jpg$/, `-${wd}.${ext}`)} ${wd}w`).join(", ")
      : undefined;
  const low = Boolean(image.lowRes);
  const pic = (
    <picture className={s.pic}>
      {srcset("avif") && <source type="image/avif" srcSet={srcset("avif")} sizes={sizes} />}
      {srcset("webp") && <source type="image/webp" srcSet={srcset("webp")} sizes={sizes} />}
      <EditableImage
        path={path}
        image={{ ...image, width: w, height: h }}
        sizes={sizes}
        priority={priority}
        className={`${s.img} ${fit === "cover" ? s.cover : ""}`}
      />
    </picture>
  );
  return (
    <figure
      className={`${s.figure} ${frame ? s.framed : ""} ${low ? s.low : ""} ${fit === "cover" ? s.fill : ""} ${className ?? ""}`}
      style={style}
      data-ai-altered={image.aiAltered ? "" : undefined}
    >
      {low && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={s.echo} src={image.src} alt="" aria-hidden width={w} height={h} loading="lazy" />
      )}
      {pic}
    </figure>
  );
}
