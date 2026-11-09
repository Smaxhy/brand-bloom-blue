/**
 * Is this tab able to keep talking to the server right now?
 *
 * Browsers slow down, freeze or suspend tabs that are in the background (and
 * phones do it as soon as you switch apps); a laptop going to sleep or the
 * network dropping does the same. Server-side scans keep their progress, so a
 * failed step while "away" is a reason to wait and carry on — never to give up.
 */

type Doc = Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
type Win = Pick<Window, "addEventListener" | "removeEventListener" | "setTimeout" | "clearTimeout">;
type Nav = Pick<Navigator, "onLine">;

const env = () =>
  typeof document === "undefined" || typeof window === "undefined"
    ? null
    : { doc: document as Doc, win: window as Win, nav: navigator as Nav };

export function pageAway(
  doc: Doc | undefined = env()?.doc,
  nav: Nav | undefined = env()?.nav,
): boolean {
  if (!doc) return false;
  return doc.visibilityState === "hidden" || nav?.onLine === false;
}

let lastAwayAt = 0;
let tracking = false;
function track() {
  const e = env();
  if (tracking || !e) return;
  tracking = true;
  const mark = () => {
    if (pageAway(e.doc, e.nav)) lastAwayAt = Date.now();
  };
  e.doc.addEventListener("visibilitychange", mark);
  e.win.addEventListener("offline", mark);
  mark();
}
track();

/** Was the tab hidden or offline at any point since `since` (ms)? */
export function wasAwaySince(since: number): boolean {
  return pageAway() || lastAwayAt >= since;
}

/** Resolves once the tab is visible and online again, or after `maxMs`, whichever comes first. */
export function waitUntilBack(maxMs: number, e = env()): Promise<void> {
  if (!e || !pageAway(e.doc, e.nav)) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (pageAway(e.doc, e.nav)) return;
      done();
    };
    const done = () => {
      e.win.clearTimeout(timer);
      e.doc.removeEventListener("visibilitychange", check);
      e.win.removeEventListener("online", check);
      resolve();
    };
    e.doc.addEventListener("visibilitychange", check);
    e.win.addEventListener("online", check);
    const timer = e.win.setTimeout(done, maxMs);
  });
}

/** Polling time for an outside scraper: the base, or more for big requests (0.5 s per business, max 30 min). */
export function pollBudgetMs(baseMs: number, wanted: number): number {
  return Math.min(30 * 60_000, Math.max(baseMs, Math.max(0, wanted) * 500));
}

/**
 * Poll `check` every `everyMs` until it reports done or `budgetMs` of time has
 * passed *with the tab present*. Time spent hidden, frozen, asleep or offline
 * doesn't use up the budget, and a check that fails while away is simply tried
 * again; other failures are retried until `maxFailures` in a row.
 */
export async function pollWhilePresent<T extends { done?: boolean }>(opts: {
  initial: T;
  check: () => Promise<T>;
  everyMs: number;
  budgetMs: number;
  maxFailures?: number;
  onTick?: (elapsedMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  away?: (since: number) => boolean;
}): Promise<{ result: T; timedOut: boolean; error?: string }> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const away = opts.away ?? wasAwaySince;
  const maxFailures = opts.maxFailures ?? 5;
  const started = now();
  let result = opts.initial;
  let used = 0;
  let failures = 0;
  while (used < opts.budgetMs) {
    const t = now();
    await sleep(opts.everyMs);
    opts.onTick?.(now() - started);
    try {
      result = await opts.check();
      failures = 0;
      if (result.done) return { result, timedOut: false };
    } catch (e) {
      if (!away(t) && ++failures >= maxFailures)
        return { result, timedOut: false, error: (e as Error)?.message || String(e) };
    }
    if (!away(t)) used += now() - t;
  }
  return { result, timedOut: true };
}
