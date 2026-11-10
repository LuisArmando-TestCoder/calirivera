import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MediaStore } from "./types";

/** Dev: writes into web/public so `next dev` serves it right away. */
export class LocalMediaStore implements MediaStore {
  readonly name = "local" as const;
  async put(relPath: string, data: Buffer) {
    const file = path.resolve(process.cwd(), "public", relPath);
    if (!file.startsWith(path.resolve(process.cwd(), "public") + path.sep)) throw new Error("ruta inválida");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    return { src: `/${relPath}` };
  }
}
