import { Db, enc } from "./db";
import type { EnrichInput, EnrichRow } from "./api-proxies";

type Env = Record<string, string | undefined>;
export interface ScanJob {
  id: string; created_by: string; label: string; status: "queued" | "running" | "done" | "failed" | "cancelled";
  options: { useClaude?: boolean; usePaid?: boolean; revealPhone?: boolean; findLinkedin?: boolean };
  people: (EnrichInput & { id: string })[]; results: Record<string, EnrichRow>;
  cursor: number; total: number; warnings: string[]; last_error: string | null;
  lease_token: string | null; lease_until: string | null; created_at: string; updated_at: string; finished_at: string | null;
}
const lite = "id,label,status,cursor,total,warnings,last_error,created_at,updated_at,finished_at";
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
export async function stepScanJob(db: Db, env: Env, id: string, owner: string,
  enrich?: (people: EnrichInput[], options: ScanJob["options"]) => Promise<{ results: EnrichRow[]; warnings: string[] }>) {
  const token = crypto.randomUUID();
  const started = Date.now();
  const scope = `id=eq.${enc(id)}&created_by=eq.${enc(owner)}`;
  const claimed = await db.update<ScanJob>("scan_jobs", `${scope}&status=in.(queued,running)&or=(lease_until.is.null,lease_until.lt.${enc(new Date().toISOString())})&select=*`, {
    status: "running", lease_token: token, lease_until: new Date(started + 600000).toISOString(), updated_at: new Date().toISOString(),
  });
  const job = claimed[0];
  if (!job) return { job: await getScanJob(db, id, owner), produced: [], claimed: false };
  const owned = `${scope}&status=eq.running&lease_token=eq.${token}`;
  const results = { ...job.results }; const warnings = new Set(job.warnings); const produced: EnrichRow[] = [];
  let cursor = job.cursor;
  try {
    const worker = enrich ?? (async (people, options) => {
      const { enrichPeople } = await import("./api-proxies");
      return enrichPeople(env, people, options);
    });
    while (cursor < job.total && Date.now() - started < 20000) {
      const chunk = job.people.slice(cursor, cursor + 2);
      const result = await worker(chunk, job.options);
      for (const row of result.results) results[row.id] = row;
      for (const warning of result.warnings) warnings.add(warning);
      if (JSON.stringify(results).length > 4000000) throw new Error("Scan result storage limit reached");
      cursor += chunk.length;
      const saved = await db.update("scan_jobs", owned, { results, cursor, warnings: [...warnings].slice(0, 20), updated_at: new Date().toISOString() });
      if (!saved.length) return { job: await getScanJob(db, id, owner), produced, claimed: true };
      produced.push(...result.results);
    }
    await db.update("scan_jobs", owned, {
      status: cursor >= job.total ? "done" : "running", lease_token: null, lease_until: null,
      finished_at: cursor >= job.total ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Scan step failed", error);
    await db.update("scan_jobs", owned, { status: "failed", last_error: "This scan stopped unexpectedly. Reopen its saved results or start a new scan.", lease_token: null, lease_until: null, finished_at: new Date().toISOString() });
  }
  return { job: await getScanJob(db, id, owner), produced, claimed: true };
}
export async function continueScanJobs(env: Env) {
  if (!Db.available(env)) return;
  const db = new Db(env);
  const jobs = await db.select<ScanJob>("scan_jobs", `status=in.(queued,running)&updated_at=lt.${enc(new Date(Date.now() - 120000).toISOString())}&select=id,created_by&order=created_at.asc&limit=3`);
  const started = Date.now();
  for (const job of jobs) {
    if (Date.now() - started > 60000) break;
    await stepScanJob(db, env, job.id, job.created_by);
  }
}