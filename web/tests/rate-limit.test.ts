import { describe, expect, it, vi } from "vitest";
import { evaluateRate, type RatePolicy, type RateState } from "@/lib/cms/rate-core";
import { MemoryStore } from "@/lib/cms/store/memory";

const P: RatePolicy = { limit: 3, windowMs: 60_000, baseBackoffMs: 10_000, maxBackoffMs: 50_000 };

describe("evaluateRate (exponential backoff)", () => {
  it("allows up to the limit inside a window", () => {
    let s: RateState | null = null;
    for (let i = 0; i < 3; i++) {
      const d = evaluateRate(s, 1000 + i, P);
      expect(d.allowed).toBe(true);
      expect(d.remaining).toBe(2 - i);
      s = d.state;
    }
    const d = evaluateRate(s, 1010, P);
    expect(d.allowed).toBe(false);
    expect(d.retryAfterMs).toBe(10_000);
  });

  it("denies during backoff without changing state", () => {
    let s: RateState | null = null;
    for (let i = 0; i < 4; i++) s = evaluateRate(s, 0, P).state;
    const d = evaluateRate(s, 5_000, P);
    expect(d.allowed).toBe(false);
    expect(d.changed).toBe(false);
    expect(d.retryAfterMs).toBe(5_000);
  });

  it("doubles the backoff with each strike and caps it", () => {
    let s: RateState | null = null;
    let t = 0;
    const backoffs: number[] = [];
    for (let strike = 0; strike < 5; strike++) {
      let d;
      do {
        d = evaluateRate(s, t, P);
        s = d.state;
        t += 1;
      } while (d.allowed);
      backoffs.push(d.retryAfterMs);
      t = s!.backoffUntil; // wait it out
    }
    expect(backoffs).toEqual([10_000, 20_000, 40_000, 50_000, 50_000]);
  });

  it("forgets strikes after the decay period", () => {
    let s: RateState | null = null;
    for (let i = 0; i < 4; i++) s = evaluateRate(s, 0, { ...P, strikeDecayMs: 100_000 }).state;
    expect(s!.strikes).toBe(1);
    const later = evaluateRate(s, 500_000, { ...P, strikeDecayMs: 100_000 });
    expect(later.allowed).toBe(true);
    expect(later.state.strikes).toBe(0);
  });

  it("resets the counter when the window passes", () => {
    let s: RateState | null = null;
    for (let i = 0; i < 3; i++) s = evaluateRate(s, 0, P).state;
    const d = evaluateRate(s, 60_000, P);
    expect(d.allowed).toBe(true);
    expect(d.state.count).toBe(1);
  });
});

describe("rateLimit (stored)", () => {
  it("persists counters and short-circuits blocked clients without reading the store", async () => {
    vi.resetModules();
    const { rateLimit } = await import("@/lib/cms/rateLimit");
    const store = new MemoryStore();
    for (let i = 0; i < 5; i++) expect((await rateLimit("codeRequestIp", "k1", store, 1000)).allowed).toBe(true);
    const denied = await rateLimit("codeRequestIp", "k1", store, 1001);
    expect(denied.allowed).toBe(false);
    expect((await store.list("rateLimits")).length).toBe(1);
    const spy = vi.spyOn(store, "update");
    const again = await rateLimit("codeRequestIp", "k1", store, 2000);
    expect(again.allowed).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    // other keys are independent
    expect((await rateLimit("codeRequestIp", "k2", store, 2000)).allowed).toBe(true);
  });
});
