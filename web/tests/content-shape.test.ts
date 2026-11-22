import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// El contenido lo escriben el editor y los scripts de migración. Estas pruebas atajan lo que un script
// puede dejar mal sin que nadie lo note: un título sin nivel (salía como una etiqueta inválida), una foto
// que apunta a un archivo que no existe, una obra que su colección no nombra.
const ROOT = join(__dirname, "..", "..");
const C = join(ROOT, "content");
const PUB = join(ROOT, "web", "public");
type Doc = Record<string, unknown> & { id?: string };
const docs = (kind: string): [string, Doc][] =>
  existsSync(join(C, kind))
    ? readdirSync(join(C, kind)).filter((f) => f.endsWith(".json")).map((f) => [`${kind}/${f}`, JSON.parse(readFileSync(join(C, kind, f), "utf8")) as Doc])
    : [];
const KINDS = ["pages", "posts", "collections", "catalogs", "press", "artworks", "memories"];
type B = { type?: string; id?: string; level?: unknown; items?: unknown[]; image?: { src?: string }; images?: { src?: string }[] };
const blocksOf = (d: Doc): B[] => [
  ...((d.body as B[]) ?? []),
  ...(((d.sections as { blocks?: B[] }[]) ?? []).flatMap((s) => s.blocks ?? [])),
];

describe("contenido", () => {
  it("todo título lleva nivel 2, 3 o 4", () => {
    const bad: string[] = [];
    for (const k of KINDS) for (const [f, d] of docs(k)) for (const b of blocksOf(d)) if (b.type === "heading" && ![2, 3, 4].includes(b.level as number)) bad.push(`${f}#${b.id}`);
    expect(bad).toEqual([]);
  });

  it("toda foto local existe en /public, en jpg, webp y avif", () => {
    const bad: string[] = [];
    const check = (f: string, src?: string) => {
      if (!src || !src.startsWith("/media/")) return;
      for (const ext of ["jpg", "webp", "avif"]) if (!existsSync(join(PUB, src.replace(/\.jpg$/, `.${ext}`)))) bad.push(`${f}: ${src} (${ext})`);
    };
    for (const k of KINDS)
      for (const [f, d] of docs(k)) {
        for (const im of (d.images as { src?: string }[]) ?? []) check(f, im.src);
        check(f, (d.image as { src?: string } | undefined)?.src);
        check(f, (d.cover as { src?: string } | undefined)?.src);
        for (const b of blocksOf(d)) {
          check(f, b.image?.src);
          for (const im of b.images ?? []) check(f, im.src);
        }
      }
    expect(bad).toEqual([]);
  });

  it("cada colección nombra obras que existen, y cada obra está en su colección", () => {
    const works = new Map(docs("artworks").map(([, d]) => [d.id as string, d]));
    const bad: string[] = [];
    const listed = new Set<string>();
    for (const [f, c] of docs("collections"))
      for (const id of (c.artworkIds as string[]) ?? []) {
        listed.add(id);
        if (!works.has(id)) bad.push(`${f} nombra ${id}, que no existe`);
        else if (works.get(id)!.collectionId !== c.id) bad.push(`${id} dice ser de ${String(works.get(id)!.collectionId)} y está en ${String(c.id)}`);
      }
    for (const [id, w] of works) if (w.status === "published" && w.collectionId && !listed.has(id)) bad.push(`${id} no aparece en la colección ${String(w.collectionId)}`);
    expect(bad).toEqual([]);
  });

  it("los renglones de una carta tienen nombre", () => {
    const bad: string[] = [];
    for (const [f, d] of docs("pages")) for (const b of blocksOf(d)) if (b.type === "menu") for (const [i, it] of ((b.items as { name?: string }[]) ?? []).entries()) if (!it.name?.trim()) bad.push(`${f}#${b.id}.${i}`);
    expect(bad).toEqual([]);
  });
});
