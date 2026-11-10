export type AnyDoc = Record<string, unknown> & { id: string };

export interface ListOptions {
  limit?: number;
  /** Order by document id descending (audit log ids are time-sortable). */
  desc?: boolean;
  startAfterId?: string;
}

export interface Store {
  readonly kind: "firestore" | "local";
  get(collection: string, id: string): Promise<AnyDoc | null>;
  list(collection: string, opts?: ListOptions): Promise<AnyDoc[]>;
  set(collection: string, id: string, data: Record<string, unknown>): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
  /** Atomic read-modify-write. Return `undefined` to leave the doc unchanged, `null` to delete it. */
  update<T extends Record<string, unknown>>(
    collection: string,
    id: string,
    fn: (current: T | null) => { next: T | null | undefined; result: unknown },
  ): Promise<unknown>;
}

/** Firestore rejects `undefined`; JSON round-trip also drops functions/symbols. */
export function clean<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}
