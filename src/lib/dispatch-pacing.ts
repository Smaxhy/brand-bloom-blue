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
 * The steady pace: seconds between two emails when a mailbox's WHOLE daily cap
 * is spread evenly over its sending hours. 40 a day over 24 h is one email
 * every 36 min; 40 a day over 09:00–17:00 is one every 12 min. Falls back to a
 * 10-hour day when the hours are unset/misconfigured.
 */
export function dripGapSeconds(windowStartHour: number, windowEndHour: number, dailyCap: number): number {
  const cap = Math.max(1, dailyCap);
  const hours = windowEndHour > windowStartHour ? windowEndHour - windowStartHour : 10;
  return Math.max(0, Math.floor((hours * 3600) / cap));
}

/** The part of today a mailbox's cap is spread over, and how much of it is still ahead. */
export interface SpreadDay {
  /** Length of today's whole sending stretch, seconds (86 400 = around the clock). */
  windowSec: number;
  /** Seconds of that stretch still left. */
  leftSec: number;
}

/** Behind schedule, the pace may rise to this many times the steady pace — never a burst. */
export const SPREAD_CATCH_UP = 3;

/**
 * Seconds to leave before the next AUTOMATIC email so a mailbox's daily cap is
 * spread over its sending day and still goes out in full:
 *
 *  - on schedule (or ahead): the steady pace, day ÷ cap;
 *  - behind — a late start, a pause, the scheduler was down, people were added
 *    in the afternoon: faster, so what is left of today's cap still fits into
 *    what is left of the day, but never faster than 3× the steady pace.
 *
 * 40 a day around the clock: every 36 min normally, every 12 min at the very
 * most (5 an hour). "Send now" is the only thing that goes faster.
 */
export function spreadGapSeconds(p: { dailyCap: number; sentToday: number } & SpreadDay): number {
  const cap = Math.max(1, Math.floor(p.dailyCap) || 1);
  const windowSec = p.windowSec > 0 ? p.windowSec : 86_400;
  const even = windowSec / cap;
  const remaining = Math.max(1, cap - Math.max(0, Math.floor(p.sentToday) || 0));
  const needed = Math.max(0, p.leftSec) / remaining;
  return Math.max(0, Math.floor(Math.max(even / SPREAD_CATCH_UP, Math.min(even, needed))));
}

/** ±15% around a gap, so a spread-out day doesn't tick like a clock. */
export function jitterGapSeconds(gapSec: number, random: () => number = Math.random): number {
  if (gapSec <= 1) return Math.max(0, Math.round(gapSec));
  return pickGapSeconds(Math.round(gapSec * 0.85), Math.round(gapSec * 1.15), random);
}

/**
 * The gap to wait after an automatic send: the sequence's own random min–max
 * pace, but never FASTER than the pace that spreads the day's cap (with jitter).
 */
export function effectiveGapSeconds(
  p: { seqMin: number; seqMax: number; spreadSec: number } | { seqMin: number; seqMax: number; windowStartHour: number; windowEndHour: number; dailyCap: number },
  random: () => number = Math.random,
): number {
  const seqGap = pickGapSeconds(p.seqMin, p.seqMax, random);
  const spreadSec = "spreadSec" in p ? p.spreadSec : dripGapSeconds(p.windowStartHour, p.windowEndHour, p.dailyCap);
  if (spreadSec <= seqGap) return seqGap; // the cap already allows the sequence's own pace
  return Math.max(seqGap, jitterGapSeconds(spreadSec, random));
}

/** "36 min", "1 h 30 min", "45 s" — for status lines. */
export function gapLabel(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 90) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 90) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}

/**
 * Rough "when will everyone have had their email" for the status panel:
 * paced by the average gap, limited by what the daily cap still allows today.
 * When the sending hours are given, the steady spread pace (day ÷ cap) is used
 * if it's slower, so the estimate matches what actually happens.
 */
export function sendEtaMinutes(p: {
  waiting: number;
  gapMinSec: number;
  gapMaxSec: number;
  dailyCap: number;
  sentToday: number;
  windowStartHour?: number;
  windowEndHour?: number;
}): { minutes: number; days: number } {
  const waiting = Math.max(0, p.waiting);
  if (!waiting) return { minutes: 0, days: 0 };
  let gapMin = (p.gapMinSec + p.gapMaxSec) / 2 / 60;
  if (p.windowStartHour != null && p.windowEndHour != null)
    gapMin = Math.max(gapMin, dripGapSeconds(p.windowStartHour, p.windowEndHour, p.dailyCap) / 60);
  const avgGapMin = Math.max(0.1, gapMin);
  const cap = Math.max(1, p.dailyCap);
  const today = Math.max(0, cap - p.sentToday);
  const days = waiting <= today ? 0 : Math.ceil((waiting - today) / cap);
  const firstDay = Math.min(waiting, today || cap);
  return { minutes: Math.round(firstDay * avgGapMin), days };
}
