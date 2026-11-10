import "server-only";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { clean, type AnyDoc, type ListOptions, type Store } from "./types";
import { CONTENT_COLLECTIONS } from "../config";

/**
 * Dev store when there is no service account.
 *  - Content collections → ../content/<collection>/<id>.json (same files the site falls back to)
 *    and mirrored into web/.content so the running dev server sees edits without a restart.
 *  - System collections (authCodes, rateLimits, auditLog, drafts) → web/.cms-data (git-ignored).
 * Not for production: Netlify's filesystem is read-only/ephemeral.
 */
const isContent = (c: string) => (CONTENT_COLLECTIONS as readonly string[]).includes(c);
const safe = (s: string) => {
  if (!/^[\w.-]+$/.test(s) || s.startsWith(".")) throw new Error(`id inválido: ${s}`);
  return s;
};

export class LocalStore implements Store {
  readonly kind = "local" as const;
  private locks = new Map<string, Promise<unknown>>();
  constructor(private cwd = process.cwd()) {}

  private dirs(collection: string): string[] {
    safe(collection);
    if (isContent(collection))
      return [path.resolve(this.cwd, "..", "content", collection), path.resolve(this.cwd, ".content", collection)];
    return [path.resolve(this.cwd, ".cms-data", collection)];
  }

  private async readArrayFile(collection: string): Promise<AnyDoc[]> {
    if (!isContent(collection)) return [];
    try {
      const parsed = JSON.parse(await readFile(path.resolve(this.cwd, "..", "content", `${collection}.json`), "utf8"));
      return (Array.isArray(parsed) ? parsed : [parsed]).filter((d) => d && typeof d === "object" && (d.id || d.slug)).map((d) => ({ ...d, id: String(d.id ?? d.slug) }));
    } catch {
      return [];
    }
  }

  async get(collection: string, id: string) {
    try {
      const raw = await readFile(path.join(this.dirs(collection)[0], `${safe(id)}.json`), "utf8");
      return { ...JSON.parse(raw), id } as AnyDoc;
    } catch {
      return (await this.readArrayFile(collection)).find((d) => d.id === id) ?? null;
    }
  }

  async list(collection: string, opts: ListOptions = {}) {
    const byId = new Map<string, AnyDoc>();
    for (const d of await this.readArrayFile(collection)) byId.set(d.id, d);
    try {
      const dir = this.dirs(collection)[0];
      for (const f of await readdir(dir)) {
        if (!f.endsWith(".json")) continue;
        const id = f.slice(0, -5);
        try {
          byId.set(id, { ...JSON.parse(await readFile(path.join(dir, f), "utf8")), id });
        } catch {}
      }
    } catch {}
    let docs = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (opts.desc) docs.reverse();
    if (opts.startAfterId) {
      const i = docs.findIndex((d) => d.id === opts.startAfterId);
      docs = i >= 0 ? docs.slice(i + 1) : docs;
    }
    return opts.limit ? docs.slice(0, opts.limit) : docs;
  }

  async set(collection: string, id: string, data: Record<string, unknown>) {
    const body = JSON.stringify(clean({ ...data, id }), null, 2) + "\n";
    for (const dir of this.dirs(collection)) {
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, `${safe(id)}.json`);
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, body);
      await rename(tmp, file);
    }
  }

  async delete(collection: string, id: string) {
    for (const dir of this.dirs(collection)) await rm(path.join(dir, `${safe(id)}.json`), { force: true });
  }

  async update<T extends Record<string, unknown>>(
    collection: string,
    id: string,
    fn: (current: T | null) => { next: T | null | undefined; result: unknown },
  ) {
    const k = `${collection}/${id}`;
    const prev = this.locks.get(k) ?? Promise.resolve();
    const run = prev.then(async () => {
      const cur = (await this.get(collection, id)) as T | null;
      const { next, result } = fn(cur);
      if (next === null) await this.delete(collection, id);
      else if (next !== undefined) await this.set(collection, id, next);
      return result;
    });
    this.locks.set(k, run.catch(() => {}));
    return run;
  }
}
