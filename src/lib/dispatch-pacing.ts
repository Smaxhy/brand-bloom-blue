export type DispatchSource = "cron" | "manual" | "tick";

/**
 * How long one dispatcher run may keep sending.
 *
 *  - manual ("Send now", the browser) and tick (database timer / open admin tab)
 *    runs are HTTP requests. They stay under 25 s so the whole run fits inside
 *    the 30 s Cloudflare keeps a request alive after the caller disconnects —
 *    closing the tab can no longer cut a send in half (which used to cause a
 *    resend, i.e. a duplicate email, 20 minutes later).
 *  - cron runs fill the time until the next cron tick. With a 1-minute cron
 *    that's ~50 s; with the old 10-minute cron it's ~9 min, so a mailbox keeps
 *    sending at its own gap instead of one email per tick.
 */
export function dispatchBudgetMs(source?: DispatchSource, sinceLastRunMs?: number | null): number {
  if (source !== "cron") return 25_000;
  if (!sinceLastRunMs || !Number.isFinite(sinceLastRunMs) || sinceLastRunMs <= 0) return 50_000;
  return Math.min(50_000, Math.max(50_000, Math.round(sinceLastRunMs) - 10_000));
}

export function fitsDispatchBudget(start: number, budget: number, wait: number, now = Date.now()): boolean {
  return now - start + wait < budget;
}

export function gapElapsed(lastSentAt: string | null | undefined, gapSeconds: number, now = Date.now()): boolean {
  return gapWaitMs(lastSentAt, gapSeconds, now) === 0;
}

/** Milliseconds still to wait before the next email may go out (0 = go now). */
export function gapWaitMs(lastSentAt: string | number | null | undefined, gapSeconds: number, now = Date.now()): number {
  if (lastSentAt == null || lastSentAt === "") return 0;
  const timestamp = typeof lastSentAt === "number" ? lastSentAt : Date.parse(lastSentAt);
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, timestamp + Math.max(0, gapSeconds) * 1000 - now);
}

/** A random gap (seconds) inside the sequence's min–max, so the rhythm doesn't look robotic. */
export function pickGapSeconds(min: number, max: number, random = Math.random): number {
  const lo = Math.max(0, Math.min(min, max));
  const hi = Math.max(lo, Math.max(min, max));
  return lo + Math.floor(random() * (hi - lo + 1));
}

/**
 * Rough "when will everyone have had their email" for the status panel:
 * paced by the average gap, limited by what the daily cap still allows today.
 */
export function sendEtaMinutes(p: {
  waiting: number;
  gapMinSec: number;
  gapMaxSec: number;
  dailyCap: number;
  sentToday: number;
}): { minutes: number; days: number } {
  const waiting = Math.max(0, p.waiting);
  if (!waiting) return { minutes: 0, days: 0 };
  const avgGapMin = Math.max(0.1, (p.gapMinSec + p.gapMaxSec) / 2 / 60);
  const cap = Math.max(1, p.dailyCap);
  const today = Math.max(0, cap - p.sentToday);
  const days = waiting <= today ? 0 : Math.ceil((waiting - today) / cap);
  const firstDay = Math.min(waiting, today || cap);
  return { minutes: Math.round(firstDay * avgGapMin), days };
}
