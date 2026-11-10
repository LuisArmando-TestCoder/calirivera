import { clean, type AnyDoc, type ListOptions, type Store } from "./types";

/** In-memory store for tests. */
export class MemoryStore implements Store {
  readonly kind = "local" as const;
  data = new Map<string, Map<string, AnyDoc>>();
  private col(c: string) {
    if (!this.data.has(c)) this.data.set(c, new Map());
    return this.data.get(c)!;
  }
  async get(c: string, id: string) {
    const d = this.col(c).get(id);
    return d ? clean(d) : null;
  }
  async list(c: string, o: ListOptions = {}) {
    let docs = [...this.col(c).values()].sort((a, b) => (a.id < b.id ? -1 : 1));
    if (o.desc) docs.reverse();
    if (o.startAfterId) docs = docs.slice(docs.findIndex((d) => d.id === o.startAfterId) + 1);
    return clean(o.limit ? docs.slice(0, o.limit) : docs);
  }
  async set(c: string, id: string, data: Record<string, unknown>) {
    this.col(c).set(id, clean({ ...data, id }));
  }
  async delete(c: string, id: string) {
    this.col(c).delete(id);
  }
  async update<T extends Record<string, unknown>>(c: string, id: string, fn: (cur: T | null) => { next: T | null | undefined; result: unknown }) {
    const { next, result } = fn((await this.get(c, id)) as T | null);
    if (next === null) await this.delete(c, id);
    else if (next !== undefined) await this.set(c, id, next);
    return result;
  }
}
