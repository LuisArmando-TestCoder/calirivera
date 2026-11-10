/**
 * CONTRATO entre la rama 5 (diseño) y la rama 4 (CMS).
 *
 * El diseño SIEMPRE renderiza contenido editable a través de estos componentes.
 * Para visitantes renderizan HTML plano (cero JS extra, sin "use client" aquí).
 * La rama 4 los reemplaza por versiones que, con sesión de admin, cargan
 * dinámicamente la capa de edición (contenteditable, botones +, reemplazo de imagen).
 *
 * `path` identifica el campo en Firestore: "<colección>/<docId>#<campo.ruta>"
 *   ej. "pages/biografia#sections.2.blocks.0.text", "artworks/beso#title"
 * Mantener las firmas; la rama 4 solo cambia la implementación.
 *
 * Implementación (rama 4): estos componentes quedan como server components puros; solo marcan
 * el DOM con data-cms-*. El editor (src/components/cms/overlay) se carga desde <CmsBoot/> en el
 * layout raíz únicamente cuando hay sesión de admin, y lee estas marcas. Así las páginas siguen
 * 100 % estáticas y los visitantes no descargan nada del editor.
 *
 * Listas:
 *   - arreglo dentro de un documento → path "pages/biografia#sections.2.blocks", itemType "block" | "image" | "link"
 *   - colección entera → path "posts" (sin "#"), itemType "post" | "person" | "artwork" | …;
 *     cada hijo directo debe contener algún Editable* con path "posts/<id>#…" (de ahí sale su id).
 *   Los hijos directos del contenedor son los elementos de la lista, en orden.
 */
import type { ElementType, ReactNode } from "react";
import type { ImageAsset } from "@/lib/content/types";

export type FieldPath = string;

export function EditableText({
  path,
  value,
  as: Tag = "span",
  multiline = false,
  className,
}: {
  path: FieldPath;
  value: string;
  as?: ElementType;
  multiline?: boolean;
  className?: string;
}) {
  return (
    <Tag className={className} data-cms-path={path} data-cms-kind={multiline ? "richtext" : "text"}>
      {value}
    </Tag>
  );
}

export function EditableImage({
  path,
  image,
  className,
  sizes,
  priority,
}: {
  path: FieldPath;
  image: ImageAsset;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  // La rama 5 puede envolver esto con su componente de imagen (blur/zoom para lowRes).
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.src}
      alt={image.alt}
      width={image.width}
      height={image.height}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      className={className}
      data-cms-path={path}
      data-cms-kind="image"
    />
  );
}

/** Lista de largo indeterminado: la rama 4 agrega el botón "+", reordenar y borrar. */
export function EditableList({
  path,
  itemType,
  children,
  className,
}: {
  path: FieldPath;
  /** "block" | "artwork" | "person" | "post" | … — qué formulario abre el "+" */
  itemType: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className} data-cms-path={path} data-cms-kind="list" data-cms-item={itemType}>
      {children}
    </div>
  );
}
