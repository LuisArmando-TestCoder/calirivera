import { describe, expect, it } from "vitest";
import { faceLabels, smallestVariant } from "../src/lib/content/faces";

const image = (alt: string) => ({ src: "/media/x-900.jpg", alt });

describe("vistas de una obra", () => {
  it("toma el nombre del paréntesis que cierra el título", () => {
    expect(faceLabels([image("Luto (frente) — Cali Rivera, 2018"), image("Luto (reverso) — Cali Rivera, 2018")])).toEqual(["Frente", "Reverso"]);
  });

  it("ignora un paréntesis que es parte del título", () => {
    expect(faceLabels([image("Plegaria por los Rohingyas ( plegaria de los viajeros) (frente) — Revelaciones, 2015")])).toEqual(["Frente"]);
  });

  it("sin paréntesis, la primera es la obra y las demás se numeran", () => {
    expect(faceLabels([image("Epifanios — Alquimia, 2008"), image("Epifanios")])).toEqual(["Obra", "Vista 2"]);
  });

  it("numera los nombres repetidos", () => {
    expect(faceLabels([image("Epifanios — Alquimia"), image("Epifanios (detalle) — Alquimia"), image("Epifanios (detalle) — Alquimia")])).toEqual(["Obra", "Detalle 1", "Detalle 2"]);
  });

  it("elige la variante más angosta para la miniatura", () => {
    expect(smallestVariant({ src: "/media/x-900.jpg", alt: "", widths: [640, 900] })).toBe("/media/x-640.webp");
    expect(smallestVariant({ src: "https://ejemplo.org/foto.png", alt: "" })).toBe("https://ejemplo.org/foto.png");
  });
});
