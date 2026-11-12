import { describe, expect, it } from "vitest";
import { diffDocs, summarize, trimSegs, wordDiff } from "@/lib/cms/versions/diff";

describe("versiones: qué cambió", () => {
  it("resalta solo las palabras que cambiaron", () => {
    const segs = wordDiff("¿Quién es Cali?", "¿Quién es Cali Rivera?");
    expect(segs.filter((s) => s.t !== "same").map((s) => s.t + ":" + s.s)).toEqual(["del:Cali?", "add:Cali Rivera?"]);
    expect(segs.map((s) => (s.t === "add" ? "" : s.s)).join("")).toBe("¿Quién es Cali?");
    expect(segs.map((s) => (s.t === "del" ? "" : s.s)).join("")).toBe("¿Quién es Cali Rivera?");
  });

  it("nombra la posición en palabras y empareja bloques por id", () => {
    const before = { title: "Inicio", updatedAt: "a", sections: [{ id: "s1", blocks: [{ id: "b1", type: "heading", text: "¿Quién es Cali?" }, { id: "b2", type: "paragraph", text: "Hola" }] }] };
    const after = { title: "Inicio", updatedAt: "b", sections: [{ id: "s1", blocks: [{ id: "b0", type: "quote", text: "Nueva cita" }, { id: "b1", type: "heading", text: "¿Quién es Cali Rivera?" }, { id: "b2", type: "paragraph", text: "Hola" }] }] };
    const ch = diffDocs(before, after);
    expect(ch.map((c) => [c.kind, c.label])).toEqual([
      ["added", "Sección 1 · Cita"],
      ["text", "Sección 1 · Título"],
    ]);
    expect(summarize(ch)).toBe("1 texto y 1 cosa nueva");
  });

  it("ignora sellos internos y detecta fotos y estado", () => {
    expect(diffDocs({ contentVersion: "1", updatedAt: "x" }, { contentVersion: "2", updatedAt: "y" })).toEqual([]);
    const ch = diffDocs({ hero: { image: { src: "/a.jpg", alt: "x" } }, status: "published" }, { hero: { image: { src: "/b.jpg", alt: "x" } }, status: "draft" });
    expect(ch[0]).toMatchObject({ kind: "image", label: "Portada · Foto", before: "/a.jpg", after: "/b.jpg" });
    expect(ch[1]).toMatchObject({ kind: "state", before: "Publicado", after: "Oculto (borrador)" });
  });

  it("recorta lo que no cambió en textos largos", () => {
    const long = "palabra ".repeat(40);
    const segs = trimSegs(wordDiff(long + "fin.", long + "final."));
    expect(segs[0].s.startsWith("…")).toBe(true);
    expect(segs[0].s.length).toBeLessThan(80);
  });
});
