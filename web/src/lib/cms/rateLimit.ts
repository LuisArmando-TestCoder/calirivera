import "server-only";
import { evaluateRate, POLICIES, type PolicyName, type RateDecision, type RateState } from "./rate-core";
import { getStore } from "./store";
import type { Store } from "./store/types";

/**
 * Stored rate limiter (collection `rateLimits`), exponential backoff.
 * A per-instance memory of active backoffs short-circuits blocked clients
 * without touching Firestore (keeps an abusive client from burning reads).
 */
const blocked = new Map<string, number>();

export async function rateLimit(policy: PolicyName, key: string, store: Store = getStore(), now = Date.now()): Promise<RateDecision> {
  const id = `${policy}__${key}`.replace(/[^\w.-]/g, "_").slice(0, 300);
  const until = blocked.get(id);
  if (until && until > now) {
    return { allowed: false, retryAfterMs: until - now, remaining: 0, changed: false, state: { count: 0, windowStart: now, backoffUntil: until, strikes: 0, lastStrikeAt: 0 } };
  }
  const decision = (await store.update<RateState & Record<string, unknown>>("rateLimits", id, (cur) => {
    const d = evaluateRate(cur, now, POLICIES[policy]);
    return { next: d.changed ? { ...d.state, policy, updatedAt: new Date(now).toISOString() } : undefined, result: d };
  })) as RateDecision;
  if (!decision.allowed) blocked.set(id, now + decision.retryAfterMs);
  if (blocked.size > 5000) blocked.clear();
  return decision;
}

export function retryText(ms: number): string {
  const min = Math.ceil(ms / 60_000);
  if (min <= 1) return "en un minuto";
  if (min < 60) return `en ${min} minutos`;
  const h = Math.ceil(min / 60);
  return h === 1 ? "en una hora" : `en ${h} horas`;
}
