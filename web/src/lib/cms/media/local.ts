import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MediaStore } from "./types";

/** Dev: writes into web/public so `next dev` serves it right away. */
export class LocalMediaStore implements MediaStore {
  readonly name = "local" as const;
  async put(relPath: string, data: Buffer) {
    // solo en desarrollo: que el empaquetador no intente meter las 10 000 imágenes de public/ en la función
    const root = path.resolve(/* turbopackIgnore: true */ process.cwd(), "public");
    const file = path.resolve(/* turbopackIgnore: true */ root, relPath);
    if (!file.startsWith(root + path.sep)) throw new Error("ruta inválida");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    return { src: `/${relPath}` };
  }
}
