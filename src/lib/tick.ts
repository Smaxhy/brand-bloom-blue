/**
 * One "tick" of background work: send what's due and move background scans on.
 *
 * Who calls it:
 *   - cron      Cloudflare Cron Trigger (wrangler.jsonc, every minute)
 *   - db        the database timer (pg_cron → POST /api/cron/tick, every minute)
 *   - external  any outside pinger using CRON_SECRET (/api/cron/tick or /api/cron/dispatch)
 *   - browser   an open admin tab, ONLY when none of the above ran in the last 90 s
 *
 * Server ticks stamp outreach_settings.last_cron_at (the "is the scheduler
 * running?" heartbeat). Browser ticks never do, so the status panel can tell
 * "sends with the app closed" from "sends only while the admin is open".
 */

import { Db } from "./db";
import { runDispatch, type DispatchReport } from "./sequencer";
import { continueScanJobs, type ContinueReport } from "./scan-jobs.server";
import { runDueSavedSearches } from "./saved-searches";
import { acquireLease, releaseLease } from "./lease";
import { dispatchBudgetMs } from "./dispatch-pacing";

type Env = Record<string, string | undefined>;
export type TickTrigger = "cron" | "db" | "browser" | "external";
export type WaitCtx = { waitUntil?: (p: Promise<unknown>) => void } | null | undefined;

export interface TickReport {
  trigger: TickTrigger;
  ran_at: string;
  dispatch?: DispatchReport;
  dispatch_skipped?: string;
  scans?: ContinueReport;
  saved_searches?: string[];
  errors: string[];
}

/** Keep the Worker alive until `work` settles, even if the caller hangs up (30 s grace). */
export function keepAlive<T>(ctx: WaitCtx, work: Promise<T>): Promise<T> {
  try {
    ctx?.waitUntil?.(work.catch(() => undefined));
  } catch {
    /* not on Workers (tests / dev) */
  }
  return work;
}

/** Server schedulers only: when did one last run, and which one? */
export async function lastServerTick(db: Pick<Db, "one">): Promise<{ at: string | null; source: string | null }> {
  const row = await db
    .one<{ last_cron_at?: string | null; last_tick_source?: string | null }>("outreach_settings", "id=eq.singleton&select=*")
    .catch(() => null);
  return { at: row?.last_cron_at ?? null, source: row?.last_tick_source ?? null };
}

async function stampHeartbeat(db: Db, trigger: TickTrigger, at: string) {
  try {
    await db.update("outreach_settings", "id=eq.singleton", { last_cron_at: at, last_tick_source: trigger });
  } catch {
    // Older database without last_tick_source: the heartbeat itself still matters.
    await db.update("outreach_settings", "id=eq.singleton", { last_cron_at: at }).catch(() => {});
  }
}

export async function runTick(
  env: Env,
  opts: {
    trigger: TickTrigger;
    origin?: string;
    dispatch?: boolean;
    scans?: boolean;
    /** Scheduled saved searches. Default: Cloudflare cron and outside pingers only (the database timer has its own 10-minute call). */
    searches?: boolean;
  },
): Promise<TickReport> {
  const db = new Db(env);
  const ranAt = new Date().toISOString();
  const report: TickReport = { trigger: opts.trigger, ran_at: ranAt, errors: [] };
  const server = opts.trigger !== "browser";

  const prev = await lastServerTick(db);
  if (!server && prev.at && Date.now() - Date.parse(prev.at) < 90_000) {
    report.dispatch_skipped = "the background scheduler is running — nothing for this tab to do";
    return report;
  }
  
  const sinceLast = prev.at ? Date.now() - Date.parse(prev.at) : null;
  const cron = opts.trigger === "cron";
  // The scheduled cron has a 30 s CPU limit shared by everything below, so it
  // reads fewer websites per tick than an HTTP-triggered tick does.
  const dispatchBudget = cron ? dispatchBudgetMs("cron", sinceLast) : 25_000;

  const sending = (async () => {
    if (opts.dispatch === false) return;
    let lease: Awaited<ReturnType<typeof acquireLease>> | undefined;
    try {
      lease = await acquireLease(db, "dispatch:auto", dispatchBudget + 20_000);
    } catch {
      report.errors.push("dispatch coordination unavailable"); return;
    }
    if (lease === null) {
      report.dispatch_skipped = "another scheduler is already sending";
      return;
    }
    try {
      report.dispatch = await runDispatch(env, {
        origin: opts.origin || env.PUBLIC_ORIGIN,
        source: cron ? "cron" : "tick",
        budgetMs: dispatchBudget,
      });
      if (server && !report.dispatch.errors.length) await stampHeartbeat(db, opts.trigger, new Date().toISOString());
    } catch (err) {
      report.errors.push(`dispatch: ${(err as Error).message}`);
    } finally {
      await releaseLease(db, lease ?? null);
    }
  })();

  const scanning = (async () => {
    if (opts.scans === false) return;
    try {
      report.scans = await continueScanJobs(env, cron ? { budgetMs: 40_000, maxSites: 18 } : { budgetMs: 20_000, maxSites: 40 });
    } catch (err) {
      report.errors.push(`scans: ${(err as Error).message}`);
    }
  })();

  const runSearches = opts.searches ?? (opts.trigger === "cron" || opts.trigger === "external");
  // Scheduled saved searches are heavy (discovery + reading sites). They start
  // only AFTER this tick's sending has finished, so a slow search can never be
  // the reason a send gets cut off, and one runs at a time.
  const searches = sending.then(async () => {
    if (!server || !runSearches) return;
    let lease: Awaited<ReturnType<typeof acquireLease>> | undefined;
    try {
      lease = await acquireLease(db, "saved-searches", 15 * 60_000);
    } catch {
      report.errors.push("saved-search coordination unavailable"); return;
    }
    if (lease === null) return;
    try {
      const ss = await runDueSavedSearches(env, db, { limit: 1 });
      report.saved_searches = ss.ran;
      if (ss.errors.length) report.errors.push(...ss.errors.map((e) => `saved search ${e}`));
    } catch (err) {
      report.errors.push(`saved searches: ${(err as Error).message}`);
    } finally {
      await releaseLease(db, lease ?? null);
    }
  });

  await Promise.all([sending, scanning, searches]);
  if (opts.trigger === "db" && !report.errors.length) await db.rpc("drain_outreach_scheduler", {}).catch(() => {});
  return report;
}

/* ------------------------------------------------- database timer token */

const enc8 = new TextEncoder();
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc8.encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomHex(bytes = 32): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Read the private hash on each request so disabling the timer revokes it immediately. */
export async function verifySchedulerToken(env: Env, token: string | null): Promise<boolean> {
  if (!token || !/^[a-f0-9]{48,128}$/.test(token) || !Db.available(env)) return false;
  const row = await new Db(env).one<{ token_hash: string }>("outreach_scheduler", "id=eq.singleton&select=token_hash").catch(() => null);
  return !!row?.token_hash && sameText(await sha256Hex(token), row.token_hash);
}
export function forgetSchedulerTokenCache() {}
