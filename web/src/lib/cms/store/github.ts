import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { CONTENT_COLLECTIONS } from "../config";
import { clean, type AnyDoc, type ListOptions, type Store } from "./types";

/**
 * El sitio se guarda a sí mismo: el contenido vive en el repositorio (content/<colección>/<id>.json) y cada
 * publicación es UN commit. Netlify ve el commit y reconstruye el sitio: gratis, con historial completo y sin
 * base de datos. Lo que no es contenido (códigos de acceso, límites, historial, borradores) va a una rama
 * aparte (cms-data) que no dispara reconstrucciones.
 *
 * Env: GITHUB_TOKEN (fine-grained, «Contents: read & write» solo sobre este repo), GITHUB_REPO ("dueño/nombre"),
 *      GITHUB_BRANCH (main), GITHUB_CONTENT_DIR (content), GITHUB_DATA_BRANCH (cms-data).
 */
const isContent = (c: string) => (CONTENT_COLLECTIONS as readonly string[]).includes(c);
const safe = (s: string) => {
  if (!/^[\w.-]+$/.test(s) || s.startsWith(".")) throw new Error(`id inválido: ${s}`);
  return s;
};
const body = (data: Record<string, unknown>, id: string) => JSON.stringify(clean({ ...data, id }), null, 1) + "\n";

type Batch = { writes: Map<string, string | null>; message: string };
const batches = new AsyncLocalStorage<Batch>();

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN && /^[\w.-]+\/[\w.-]+$/.test(process.env.GITHUB_REPO ?? ""));
}

export class GitHubStore implements Store {
  readonly kind = "github" as const;
  private token = process.env.GITHUB_TOKEN ?? "";
  readonly repo = process.env.GITHUB_REPO ?? "";
  readonly branch = process.env.GITHUB_BRANCH ?? "main";
  private contentDir = (process.env.GITHUB_CONTENT_DIR ?? "content").replace(/^\/+|\/+$/g, "");
  private dataBranch = process.env.GITHUB_DATA_BRANCH ?? "cms-data";
  private dataReady: Promise<void> | null = null;

  async api(path: string, init: RequestInit & { raw?: boolean } = {}): Promise<Response> {
    return fetch(`https://api.github.com/repos/${this.repo}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: init.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  }
  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const r = await this.api(path, init);
    if (!r.ok) throw new Error(`GitHub ${r.status} en ${path.split("?")[0]}: ${(await r.text()).slice(0, 160)}`);
    return (await r.json()) as T;
  }

  private where(collection: string, id?: string) {
    safe(collection);
    const content = isContent(collection);
    const dir = content ? `${this.contentDir}/${collection}` : `cms/${collection}`;
    return { branch: content ? this.branch : this.dataBranch, dir, path: id ? `${dir}/${safe(id)}.json` : dir, content };
  }
  private enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");

  /** La rama de datos se crea sola la primera vez (huérfana: no arrastra el sitio ni dispara despliegues). */
  private ensureData(): Promise<void> {
    return (this.dataReady ??= (async () => {
      const r = await this.api(`/git/ref/heads/${this.dataBranch}`);
      if (r.ok) return;
      const tree = await this.json<{ sha: string }>("/git/trees", {
        method: "POST",
        body: JSON.stringify({ tree: [{ path: "README.md", mode: "100644", type: "blob", content: "Datos internos del editor de calirivera.com (historial, borradores). No es el sitio.\n" }] }),
      });
      const commit = await this.json<{ sha: string }>("/git/commits", { method: "POST", body: JSON.stringify({ message: "cms: rama de datos", tree: tree.sha, parents: [] }) });
      const mk = await this.api("/git/refs", { method: "POST", body: JSON.stringify({ ref: `refs/heads/${this.dataBranch}`, sha: commit.sha }) });
      if (!mk.ok && mk.status !== 422) throw new Error(`GitHub ${mk.status}: no pude crear la rama ${this.dataBranch}`);
    })().catch((e) => {
      this.dataReady = null;
      throw e;
    }));
  }

  private async read(collection: string, id: string): Promise<{ doc: AnyDoc; sha: string } | null> {
    const w = this.where(collection, id);
    if (!w.content) await this.ensureData();
    const r = await this.api(`/contents/${this.enc(w.path)}?ref=${encodeURIComponent(w.branch)}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub ${r.status} al leer ${collection}/${id}`);
    const j = (await r.json()) as { sha: string; content?: string; encoding?: string };
    let text = j.content && j.encoding === "base64" ? Buffer.from(j.content, "base64").toString("utf8") : "";
    if (!text) {
      const raw = await this.api(`/git/blobs/${j.sha}`, { raw: true }); // archivos de más de 1 MB
      text = await raw.text();
    }
    return { doc: { ...JSON.parse(text), id }, sha: j.sha };
  }

  async get(collection: string, id: string) {
    const w = this.where(collection, id);
    const b = batches.getStore();
    if (b && w.content && b.writes.has(w.path)) {
      const t = b.writes.get(w.path);
      return t ? ({ ...JSON.parse(t), id } as AnyDoc) : null;
    }
    return (await this.read(collection, id))?.doc ?? null;
  }

  async list(collection: string, opts: ListOptions = {}) {
    const w = this.where(collection);
    if (!w.content) await this.ensureData();
    const [owner, name] = this.repo.split("/");
    const r = await fetch("https://api.github.com/graphql", {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query($o:String!,$n:String!,$e:String!){repository(owner:$o,name:$n){object(expression:$e){... on Tree{entries{name object{... on Blob{text isTruncated}}}}}}}`,
        variables: { o: owner, n: name, e: `${w.branch}:${w.dir}` },
      }),
    });
    if (!r.ok) throw new Error(`GitHub ${r.status} al listar ${collection}`);
    const j = (await r.json()) as { data?: { repository?: { object?: { entries?: { name: string; object?: { text?: string | null; isTruncated?: boolean } }[] } | null } } };
    const byId = new Map<string, AnyDoc>();
    for (const e of j.data?.repository?.object?.entries ?? []) {
      if (!e.name.endsWith(".json")) continue;
      const id = e.name.slice(0, -5);
      try {
        if (e.object?.text && !e.object.isTruncated) byId.set(id, { ...JSON.parse(e.object.text), id });
        else {
          const one = await this.read(collection, id);
          if (one) byId.set(id, one.doc);
        }
      } catch {}
    }
    const b = batches.getStore();
    if (b && w.content)
      for (const [p, t] of b.writes) {
        if (!p.startsWith(`${w.dir}/`)) continue;
        const id = p.slice(w.dir.length + 1, -5);
        if (t) byId.set(id, { ...JSON.parse(t), id });
        else byId.delete(id);
      }
    let docs = [...byId.values()].sort((a, c) => (a.id < c.id ? -1 : a.id > c.id ? 1 : 0));
    if (opts.desc) docs.reverse();
    if (opts.startAfterId) {
      const i = docs.findIndex((d) => d.id === opts.startAfterId);
      docs = i >= 0 ? docs.slice(i + 1) : docs;
    }
    return opts.limit ? docs.slice(0, opts.limit) : docs;
  }

  private async put(collection: string, id: string, text: string | null, sha?: string, message?: string): Promise<boolean> {
    const w = this.where(collection, id);
    if (!w.content) await this.ensureData();
    if (sha === undefined) sha = (await this.read(collection, id))?.sha;
    if (text === null && !sha) return true;
    const r = await this.api(`/contents/${this.enc(w.path)}`, {
      method: text === null ? "DELETE" : "PUT",
      body: JSON.stringify({
        message: message ?? `cms: ${text === null ? "quitar" : "guardar"} ${collection}/${id}`,
        ...(text === null ? {} : { content: Buffer.from(text).toString("base64") }),
        ...(sha ? { sha } : {}),
        branch: w.branch,
        committer: { name: "Editor calirivera.com", email: "arte@calirivera.com" },
      }),
    });
    if (r.status === 409 || r.status === 422) return false; // otro cambio llegó primero
    if (!r.ok) throw new Error(`GitHub ${r.status} al guardar ${collection}/${id}`);
    return true;
  }

  async set(collection: string, id: string, data: Record<string, unknown>) {
    const w = this.where(collection, id);
    const text = body(data, id);
    const b = batches.getStore();
    if (b && w.content) return void b.writes.set(w.path, text);
    for (let i = 0; i < 3; i++) if (await this.put(collection, id, text)) return;
    throw new Error(`No pude guardar ${collection}/${id}: alguien más lo cambió al mismo tiempo.`);
  }

  async delete(collection: string, id: string) {
    const w = this.where(collection, id);
    const b = batches.getStore();
    if (b && w.content) return void b.writes.set(w.path, null);
    for (let i = 0; i < 3; i++) if (await this.put(collection, id, null)) return;
  }

  async update<T extends Record<string, unknown>>(collection: string, id: string, fn: (current: T | null) => { next: T | null | undefined; result: unknown }) {
    const w = this.where(collection, id);
    const b = batches.getStore();
    if (b && w.content) {
      const { next, result } = fn((await this.get(collection, id)) as T | null);
      if (next === null) b.writes.set(w.path, null);
      else if (next !== undefined) b.writes.set(w.path, body(next, id));
      return result;
    }
    for (let i = 0; i < 5; i++) {
      const cur = await this.read(collection, id);
      const { next, result } = fn((cur?.doc as T | undefined) ?? null);
      if (next === undefined) return result;
      if (await this.put(collection, id, next === null ? null : body(next, id), cur?.sha ?? "")) return result;
    }
    throw new Error(`No pude actualizar ${collection}/${id}.`);
  }

  /**
   * Todo lo que se escriba dentro de `fn` (contenido) sale en un solo commit: una publicación = un commit =
   * una reconstrucción del sitio. Devuelve el sha del commit (o null si no cambió nada).
   */
  async batch<T>(message: string, fn: () => Promise<T>): Promise<{ result: T; commit: string | null }> {
    if (batches.getStore()) return { result: await fn(), commit: null };
    const b: Batch = { writes: new Map(), message };
    const result = await batches.run(b, fn);
    if (!b.writes.size) return { result, commit: null };
    const tree = [...b.writes].map(([path, text]) => (text === null ? { path, mode: "100644", type: "blob", sha: null } : { path, mode: "100644", type: "blob", content: text }));
    for (let i = 0; i < 4; i++) {
      const ref = await this.json<{ object: { sha: string } }>(`/git/ref/heads/${this.branch}`);
      const head = await this.json<{ tree: { sha: string } }>(`/git/commits/${ref.object.sha}`);
      const t = await this.api("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
      if (!t.ok) {
        // borrar algo que ya no existe: reintentar sin los borrados
        if (t.status === 422 && tree.some((e) => e.sha === null)) {
          tree.splice(0, tree.length, ...tree.filter((e) => e.sha !== null));
          if (!tree.length) return { result, commit: null };
          continue;
        }
        throw new Error(`GitHub ${t.status} al preparar la publicación`);
      }
      const tj = (await t.json()) as { sha: string };
      if (tj.sha === head.tree.sha) return { result, commit: null };
      const c = await this.json<{ sha: string }>("/git/commits", {
        method: "POST",
        body: JSON.stringify({ message: b.message, tree: tj.sha, parents: [ref.object.sha], author: { name: "Cali Rivera (editor del sitio)", email: "arte@calirivera.com" } }),
      });
      const up = await this.api(`/git/refs/heads/${this.branch}`, { method: "PATCH", body: JSON.stringify({ sha: c.sha }) });
      if (up.ok) return { result, commit: c.sha };
      if (up.status !== 422) throw new Error(`GitHub ${up.status} al publicar`);
    }
    throw new Error("No pude publicar: el sitio estaba recibiendo otro cambio. Probá de nuevo.");
  }
}
