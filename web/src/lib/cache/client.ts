"use client";
import { useEffect, useState } from "react";

/**
 * Layer 2 (client): localStorage keyed by `key`, valid while `version`
 * (SiteSettings.contentVersion, rendered by the server) matches.
 * Any storage access is wrapped in try/catch (private mode, quota, sandboxed iframes).
 */
const PREFIX = "cr:v1:";

type Entry<T> = { version: string; savedAt: number; data: T };

export function readCache<T>(key: string, version: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    return entry.version === version ? entry.data : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, version: string, data: T): void {
  try {
    const entry: Entry<T> = { version, savedAt: Date.now(), data };
    window.localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    /* quota or disabled storage — ignore */
  }
}

/** Drop every entry from an older content version. */
export function pruneCache(version: string): void {
  try {
    const ls = window.localStorage;
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      try {
        if ((JSON.parse(ls.getItem(k) ?? "{}") as Entry<unknown>).version !== version) ls.removeItem(k);
      } catch {
        ls.removeItem(k);
      }
    }
  } catch {}
}

/**
 * Returns cached data immediately when the version matches; otherwise runs
 * `fetcher` (e.g. a Firestore client read or /api route) once and stores it.
 * `initial` (server-rendered data) wins and seeds the cache, so the first
 * paint never waits on the client.
 */
export function useVersionedCache<T>(
  key: string,
  version: string,
  fetcher: () => Promise<T>,
  initial?: T,
): { data: T | undefined; stale: boolean } {
  const [data, setData] = useState<T | undefined>(initial);
  const [stale, setStale] = useState(initial === undefined);

  useEffect(() => {
    let alive = true;
    if (initial !== undefined) {
      writeCache(key, version, initial);
      return;
    }
    // Async chain (no synchronous setState inside the effect body).
    Promise.resolve(readCache<T>(key, version))
      .then(async (hit) => {
        if (hit !== null) return hit;
        const fresh = await fetcher();
        writeCache(key, version, fresh);
        return fresh;
      })
      .then((value) => {
        if (!alive) return;
        setData(value);
        setStale(false);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // fetcher intentionally excluded: callers pass inline closures
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version, initial]);

  return { data, stale };
}
