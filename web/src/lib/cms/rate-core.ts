/** Pure rate-limit core with exponential backoff (see rateLimit.ts for storage). */
export interface RatePolicy {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
  /** First backoff after exceeding the limit; doubles with every strike. */
  baseBackoffMs: number;
  maxBackoffMs: number;
  /** Strikes are forgotten after this long without a new strike. */
  strikeDecayMs?: number;
}

export interface RateState {
  count: number;
  windowStart: number;
  backoffUntil: number;
  strikes: number;
  lastStrikeAt: number;
}

export interface RateDecision {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
  state: RateState;
  /** False when the decision did not change the stored state (denied during backoff). */
  changed: boolean;
}

export function evaluateRate(prev: RateState | null, now: number, p: RatePolicy): RateDecision {
  const decay = p.strikeDecayMs ?? 24 * 3600_000;
  let s: RateState = prev
    ? { ...prev }
    : { count: 0, windowStart: now, backoffUntil: 0, strikes: 0, lastStrikeAt: 0 };

  if (s.backoffUntil > now) {
    return { allowed: false, retryAfterMs: s.backoffUntil - now, remaining: 0, state: s, changed: false };
  }
  if (now - s.windowStart >= p.windowMs) {
    s = { ...s, count: 0, windowStart: now };
  }
  if (s.strikes > 0 && now - s.lastStrikeAt > decay) {
    s = { ...s, strikes: 0 };
  }
  s.count += 1;
  if (s.count > p.limit) {
    s.strikes += 1;
    const backoff = Math.min(p.baseBackoffMs * 2 ** (s.strikes - 1), p.maxBackoffMs);
    s.backoffUntil = now + backoff;
    s.lastStrikeAt = now;
    // New window starts when the backoff ends.
    s.count = 0;
    s.windowStart = s.backoffUntil;
    return { allowed: false, retryAfterMs: backoff, remaining: 0, state: s, changed: true };
  }
  return { allowed: true, retryAfterMs: 0, remaining: p.limit - s.count, state: s, changed: true };
}

const MIN = 60_000;
const HOUR = 60 * MIN;

export const POLICIES = {
  /** Asking for a login code, per IP. */
  codeRequestIp: { limit: 5, windowMs: 10 * MIN, baseBackoffMs: 5 * MIN, maxBackoffMs: 24 * HOUR },
  /** Asking for a login code, per e-mail (OWASP: ~5/h). */
  codeRequestEmail: { limit: 5, windowMs: HOUR, baseBackoffMs: 15 * MIN, maxBackoffMs: 24 * HOUR },
  /** Trying codes, per IP. */
  codeVerifyIp: { limit: 10, windowMs: 10 * MIN, baseBackoffMs: 5 * MIN, maxBackoffMs: 24 * HOUR },
  /** Public API requests, per IP (burst). */
  publicBurst: { limit: 60, windowMs: MIN, baseBackoffMs: MIN, maxBackoffMs: 6 * HOUR },
  /** Public Firestore-backed reads per client per day. */
  publicDailyReads: { limit: 2000, windowMs: 24 * HOUR, baseBackoffMs: 12 * HOUR, maxBackoffMs: 24 * HOUR },
} satisfies Record<string, RatePolicy>;

export type PolicyName = keyof typeof POLICIES;
