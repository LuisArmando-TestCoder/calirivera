import { describe, expect, it } from "vitest";
import { applyOps, docKey, docsTouched, isInlineOps, type DocMap } from "@/lib/cms/ops";
import { parsePath } from "@/lib/cms/paths";
import { validateDoc } from "@/lib/cms/validate";
import { COLLECTION_DEFS, isContentCollection } from "@/lib/cms/config";

const page = () =>
  new Map([
    [
      docKey("pages", "biografia"),
      { id: "biografia", title: "Bio", sections: [{ id: "s1", layout: "auto", blocks: [{ type: "paragraph", id: "a", text: "uno" }, { type: "paragraph", id: "b", text: "dos" }] }] },
    ],
  ]) as DocMap;

describe("paths", () => {
  it("parses field and collection paths and rejects prototype keys", () => {
    expect(parsePath("pages/biografia#sections.0.blocks.1.text")).toEqual({ kind: "field", collection: "pages", docId: "biografia", field: ["sections", "0", "blocks", "1", "text"] });
    expect(parsePath("posts")).toEqual({ kind: "collection", collection: "posts" });
    expect(parsePath("pages/x#__proto__.polluted")).toBeNull();
    expect(parsePath("pages#title")).toBeNull();
  });
});

describe("applyOps", () => {
  it("sets, inserts, moves and removes inside a document", () => {
    const r = applyOps(
      page(),
      [
        { t: "set", path: "pages/biografia#sections.0.blocks.0.text", value: "UNO" },
        { t: "insert", path: "pages/biografia#sections.0.blocks", index: 2, value: { type: "quote", id: "c", text: "tres" } },
        { t: "move", path: "pages/biografia#sections.0.blocks", from: 2, to: 0 },
        { t: "remove", path: "pages/biografia#sections.0.blocks", index: 2 },
      ],
      isContentCollection,
    );
    const blocks = (r.docs.get(docKey("pages", "biografia")) as { sections: { blocks: { text: string }[] }[] }).sections[0].blocks;
    expect(blocks.map((b) => b.text)).toEqual(["tres", "UNO"]);
  });

  it("creates, reorders and trashes at collection level", () => {
    const docs: DocMap = new Map([
      [docKey("people", "ana"), { id: "ana", name: "Ana" }],
      [docKey("people", "beto"), { id: "beto", name: "Beto" }],
    ]);
    const ops = [
      { t: "create" as const, collection: "people", tempId: "__n1", value: { name: "Carla" } },
      { t: "set" as const, path: "people/__n1#discipline", value: "poeta" },
      { t: "reorder" as const, collection: "people", ids: ["beto", "ana"] },
      { t: "trash" as const, collection: "people", id: "ana" },
    ];
    expect(docsTouched(ops)).toEqual([
      { collection: "people", id: "beto" },
      { collection: "people", id: "ana" },
    ]);
    const r = applyOps(docs, ops, isContentCollection);
    expect(r.docs.get(docKey("people", "__n1"))).toEqual({ name: "Carla", discipline: "poeta" });
    expect((r.docs.get(docKey("people", "beto")) as { order: number }).order).toBe(10);
    expect(r.trashed).toEqual([{ collection: "people", id: "ana" }]);
  });

  it("refuses system collections and unknown docs", () => {
    expect(() => applyOps(new Map(), [{ t: "set", path: "authCodes/x#codeHash", value: "1" }], isContentCollection)).toThrow();
    expect(() => applyOps(new Map(), [{ t: "set", path: "pages/nope#title", value: "1" }], isContentCollection)).toThrow();
  });

  it("validates op shapes from the client", () => {
    expect(isInlineOps([{ t: "set", path: "pages/a#b", value: 1 }])).toBe(true);
    expect(isInlineOps([{ t: "eval", code: "x" }])).toBe(false);
    expect(isInlineOps("nope")).toBe(false);
  });
});

describe("validateDoc", () => {
  it("enforces required, max length and cleans blocks", () => {
    const { ok, errors, value } = validateDoc(COLLECTION_DEFS.posts, {
      title: "x".repeat(130),
      publishedAt: "2026-11-10",
      body: [{ type: "paragraph", text: "hola" }, { type: "heading", text: "" }, { type: "script", text: "x" }],
      tags: "poesía, música",
    });
    expect(ok).toBe(false);
    expect(errors.title).toMatch(/máximo 120/);
    expect(errors["body.1.text"]).toBeTruthy();
    expect(errors["body.2"]).toBeTruthy();
    expect(value.publishedAt).toBe("2026-11-10T18:00:00.000Z");
    expect(value.tags).toEqual(["poesía", "música"]);
  });
  it("rejects unsafe links", () => {
    const { errors } = validateDoc(COLLECTION_DEFS.settings, { siteName: "a", tagline: "b", email: "c", social: [{ label: "x", href: "javascript:alert(1)" }] });
    expect(errors["social.0"]).toBeTruthy();
  });
});

describe("archive", () => {
  it("hides a document without deleting it", () => {
    const docs = new Map([[docKey("artworks", "a1"), { id: "a1", title: "Obra", status: "published" }]]) as DocMap;
    const ops = [{ t: "archive" as const, collection: "artworks", id: "a1" }];
    expect(isInlineOps(ops)).toBe(true);
    expect(docsTouched(ops)).toEqual([{ collection: "artworks", id: "a1" }]);
    const r = applyOps(docs, ops, isContentCollection);
    expect(r.docs.get(docKey("artworks", "a1"))).toMatchObject({ status: "draft", archived: true, title: "Obra" });
    expect(r.trashed).toEqual([]);
  });
});
