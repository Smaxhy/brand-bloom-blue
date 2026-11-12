import { Db, enc } from "./db";
import type { EnrichInput, EnrichRow } from "./api-proxies";

type Env = Record<string, string | undefined>;
export interface ScanJob {
  id: string; created_by: string; label: string; status: "queued" | "running" | "done" | "failed" | "cancelled";
  options: { useClaude?: boolean; usePaid?: boolean; revealPhone?: boolean; findLinkedin?: boolean; findInstagram?: boolean; allowGuesses?: boolean; _stalls?: number };
  people: (EnrichInput & { id: string })[]; results: Record<string, EnrichRow>;
  cursor: number; total: number; warnings: string[]; last_error: string | null;
  lease_token: string | null; lease_until: string | null; created_at: string; updated_at: string; finished_at: string | null;
}
const lite = "id,label,status,cursor,total,warnings,last_error,created_at,updated_at,finished_at";
/** A runner holds a scan for this long; it renews after every saved chunk. A closed tab lets go within this time. */
export const SCAN_LEASE_MS = 90_000;
/** Websites read side by side in one chunk. */
export const SCAN_CHUNK = 6;
export const MAX_RESULT_ROWS = 4000;
export const MAX_RESULT_BYTES = 3_500_000;

/**
 * A scan's results live in one database row. Past these sizes it stops cleanly
 * (keeping what it found) instead of throwing and failing the whole scan — which
 * is what used to happen on big scrapes. Kept comfortably under the row's hard
 * ceiling so the final save always lands.
 */
export const MAX_RESULT_ROWS = 4000;
export const MAX_RESULT_BYTES = 3_500_000;

export async function getScanJob(db: Db, id: string, owner: string, full = false) {
  return db.one<ScanJob>("scan_jobs", `id=eq.${enc(id)}&created_by=eq.${enc(owner)}&select=${full ? "*" : lite}`);
}
export async function listScanJobs(db: Db, owner: string) {
  return db.select<ScanJob>("scan_jobs", `created_by=eq.${enc(owner)}&select=${lite}&order=created_at.desc&limit=12`);
}
export async function cancelScanJob(db: Db, id: string, owner: string) {
  await db.update("scan_jobs", `id=eq.${enc(id)}&created_by=eq.${enc(owner)}&status=in.(queued,running)`, {
    status: "cancelled", lease_token: null, lease_until: null, finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
}

export interface StepOptions {
  /** Stop starting new chunks after this long (ms). */
  budgetMs?: number;
  /** Websites per chunk (read in parallel). */
  chunkSize?: number;
  /** Read at most this many websites in this call. */
  maxSites?: number;
  /** Skip this many people first (a site that keeps crashing the reader). */
  skip?: number;
}

export async function stepScanJob(db: Db, env: Env, id: string, owner: string,
  enrich?: (people: EnrichInput[], options: ScanJob["options"]) => Promise<{ results: EnrichRow[]; warnings: string[] }>,
  opts: StepOptions = {}) {
  const token = crypto.randomUUID();
  const started = Date.now();
  const budget = Math.max(1_000, opts.budgetMs ?? 22_000);
  const chunkSize = Math.max(1, Math.min(12, opts.chunkSize ?? SCAN_CHUNK));
  const maxSites = Math.max(1, opts.maxSites ?? Number.POSITIVE_INFINITY);
  const scope = `id=eq.${enc(id)}&created_by=eq.${enc(owner)}`;
  const claimed = await db.update<ScanJob>("scan_jobs", `${scope}&status=in.(queued,running)&or=(lease_until.is.null,lease_until.lt.${enc(new Date().toISOString())})&select=*`, {
    status: "running", lease_token: token, lease_until: new Date(started + SCAN_LEASE_MS).toISOString(), updated_at: new Date().toISOString(),
  });
  const job = claimed[0];
  if (!job) return { job: await getScanJob(db, id, owner), produced: [], claimed: false };
  const owned = `${scope}&status=eq.running&lease_token=eq.${token}`;
  const results = { ...job.results }; const warnings = new Set(job.warnings); const produced: EnrichRow[] = [];
  let cursor = job.cursor;
  let read = 0;
  if (opts.skip && cursor < job.total) {
    const skipped = Math.min(opts.skip, job.total - cursor);
    cursor += skipped;
    warnings.add(`Skipped ${skipped} website${skipped === 1 ? "" : "s"} that kept stopping the reader.`);
  }
  let capped = false;
  try {
    const worker = enrich ?? (async (people, options) => {
      const { enrichPeople } = await import("./api-proxies");
      return enrichPeople(env, people, options);
    });
    while (cursor < job.total && Date.now() - started < budget && read < maxSites) {
      const chunk = job.people.slice(cursor, cursor + Math.min(chunkSize, maxSites - read));
      const result = await worker(chunk, job.options);
      for (const row of result.results) results[row.id] = row;
      for (const warning of result.warnings) warnings.add(warning);
      cursor += chunk.length;
      read += chunk.length;
      // A very large scan would outgrow the row it's saved in. Instead of letting
      // that throw and kill the whole scan (losing everything it found), stop
      // cleanly here: keep what's been read and tell them to narrow or batch it.
      const rowCount = Object.keys(results).length;
      if (rowCount > MAX_RESULT_ROWS || JSON.stringify(results).length > MAX_RESULT_BYTES) {
        capped = true;
        warnings.add(
          "This scan reached its size limit, so it stopped here with what it had found. To get more, narrow the search (smaller area or fewer keywords) or run it in smaller batches.",
        );
      }
      const saved = await db.update("scan_jobs", owned, {
        results, cursor, warnings: [...warnings].slice(0, 20), updated_at: new Date().toISOString(),
        lease_until: new Date(Date.now() + SCAN_LEASE_MS).toISOString(),
        ...(job.options?._stalls ? { options: { ...job.options, _stalls: 0 } } : {}),
      });
      if (!saved.length) return { job: await getScanJob(db, id, owner), produced, claimed: true };
      if (job.options?._stalls) job.options = { ...job.options, _stalls: 0 };
      produced.push(...result.results);
      if (capped) break;
    }
    const done = capped || cursor >= job.total;
    await db.update("scan_jobs", owned, {
      status: done ? "done" : "running", lease_token: null, lease_until: null, cursor,
      ...(opts.skip || capped ? { warnings: [...warnings].slice(0, 20) } : {}),
      finished_at: done ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Scan step failed", error);
    await db.update("scan_jobs", owned, { status: "failed", last_error: "This scan stopped unexpectedly. Reopen its saved results or start a new scan.", lease_token: null, lease_until: null, finished_at: new Date().toISOString() });
  }
  return { job: await getScanJob(db, id, owner), produced, claimed: true };
}

export interface ContinueReport {
  jobs: number;
  read: number;
  finished: number;
}

/**
 * Background continuation (cron / database timer / an open admin tab): move
 * every unclaimed scan forward, oldest first, inside one time budget. A scan
 * an open Scraper tab is driving holds a lease, so it is skipped here.
 */
export async function continueScanJobs(env: Env, opts: { budgetMs?: number; maxSites?: number } = {}): Promise<ContinueReport> {
  const out: ContinueReport = { jobs: 0, read: 0, finished: 0 };
  if (!Db.available(env)) return out;
  const db = new Db(env);
  const budget = opts.budgetMs ?? 20_000;
  let sitesLeft = opts.maxSites ?? 40;
  const started = Date.now();
  const nowIso = enc(new Date().toISOString());
  const jobs = await db.select<Pick<ScanJob, "id" | "created_by" | "lease_token" | "lease_until" | "options">>(
    "scan_jobs",
    `status=in.(queued,running)&or=(lease_until.is.null,lease_until.lt.${nowIso})&select=id,created_by,lease_token,lease_until,options&order=updated_at.asc&limit=6`,
  );
  for (const job of jobs) {
    const remaining = budget - (Date.now() - started);
    if (remaining < 4_000 || sitesLeft <= 0) break;
    const r = await stepScanJob(db, env, job.id, job.created_by, undefined, {
      budgetMs: remaining, maxSites: sitesLeft, chunkSize: SCAN_CHUNK,
    });
    if (!r.claimed) continue;
    out.jobs++;
    const done = r.produced.length;
    out.read += done;
    sitesLeft -= Math.max(1, done);
    if (r.job?.status === "done") out.finished++;
  }
  return out;
}
