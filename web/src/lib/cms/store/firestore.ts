import "server-only";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { clean, type AnyDoc, type ListOptions, type Store } from "./types";

export class FirestoreStore implements Store {
  readonly kind = "firestore" as const;
  constructor(private db: Firestore) {}

  async get(collection: string, id: string) {
    const snap = await this.db.collection(collection).doc(id).get();
    return snap.exists ? ({ ...(snap.data() as object), id: snap.id } as AnyDoc) : null;
  }

  async list(collection: string, opts: ListOptions = {}) {
    let q = this.db.collection(collection).orderBy(FieldPath.documentId(), opts.desc ? "desc" : "asc");
    if (opts.startAfterId) q = q.startAfter(opts.startAfterId);
    if (opts.limit) q = q.limit(opts.limit);
    const snap = await q.get();
    return snap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as AnyDoc);
  }

  async set(collection: string, id: string, data: Record<string, unknown>) {
    await this.db.collection(collection).doc(id).set(clean({ ...data, id }));
  }

  async delete(collection: string, id: string) {
    await this.db.collection(collection).doc(id).delete();
  }

  async update<T extends Record<string, unknown>>(
    collection: string,
    id: string,
    fn: (current: T | null) => { next: T | null | undefined; result: unknown },
  ) {
    const ref = this.db.collection(collection).doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const { next, result } = fn(snap.exists ? (snap.data() as T) : null);
      if (next === null) tx.delete(ref);
      else if (next !== undefined) tx.set(ref, clean(next));
      return result;
    });
  }
}
