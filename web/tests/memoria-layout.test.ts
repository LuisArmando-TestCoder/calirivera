import { describe, expect, it } from "vitest";
import type { Memory } from "@/lib/content/types";
import { layoutMemories, srcsetOf } from "@/lib/memoria/layout";

const mem = (slug: string, year: number | string | undefined, w = 800, h = 600, extra: Partial<Memory> = {}): Memory => ({
  id: slug,
  slug,
  status: "published",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  image: { src: `/media/memoria/${slug}-960.jpg`, alt: slug, width: w, height: h, widths: [480, 960] },
  kind: "obra",
  source: "wayback",
  aiAltered: false,
  year,
  ...extra,
});

describe("layoutMemories", () => {
  it("agrupa por año, de viejo a nuevo, con «sin fecha» al final", () => {
    const ys = layoutMemories([mem("a", 2016), mem("b", 1993), mem("c", undefined), mem("d", "2000")]);
    expect(ys.map((y) => y.key)).toEqual(["1993", "2000", "2016", "sin-fecha"]);
  });

  it("es determinista y respeta los límites de la trama", () => {
    const list = Array.from({ length: 30 }, (_, i) => mem(`m${i}`, 2003, 400 + i * 37, 300 + ((i * 53) % 900)));
    const a = layoutMemories(list);
    const b = layoutMemories(list.slice().reverse());
    expect(a).toEqual(b);
    for (const p of a[0].items) {
      expect(p.c).toBeGreaterThanOrEqual(2);
      expect(p.c).toBeLessThanOrEqual(8);
      expect(p.cm).toBeLessThanOrEqual(6);
      expect(p.r).toBeGreaterThanOrEqual(2);
      expect(Math.abs(p.rot)).toBeLessThanOrEqual(1.2);
    }
  });

  it("un año con pocas fotos las muestra más grandes; destacadas, más", () => {
    const [few] = layoutMemories([mem("x", 1995)]);
    const [many] = layoutMemories(Array.from({ length: 20 }, (_, i) => mem(`y${i}`, 1995)));
    expect(few.items[0].c).toBeGreaterThan(many.items[5].c);
    const [f] = layoutMemories([mem("p", 2001), mem("q", 2001, 800, 600, { featured: true }), mem("r", 2001)]);
    expect(f.items[0].memory.slug).toBe("q");
  });
});

describe("srcsetOf", () => {
  it("arma el srcset de las variantes optimizadas", () => {
    expect(srcsetOf("/media/memoria/a-960.jpg", [480, 960], "avif")).toBe("/media/memoria/a-480.avif 480w, /media/memoria/a-960.avif 960w");
    expect(srcsetOf("/x.png", [480], "webp")).toBeUndefined();
  });
});
