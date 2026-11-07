import type { EnrichResult, RawBusiness, ScanPerson, ScanJobLite, ScanJobFull } from "./store";

export function rawScanPerson(row: RawBusiness): ScanPerson {
  return { id: row.id, name: row.contactName || "", domain: row.website || "",
    organizationName: row.business, phone: row.phone, linkedin: row.linkedin,
    city: row.city, industry: row.industry, rating: row.rating, reviews: row.reviews };
}

export function needsRawEnrichment(row: RawBusiness) {
  return !row.email || !row.contactName || !row.contactTitle || !row.phone || !row.website;
}

export function mergeRawReveal(row: RawBusiness, result: EnrichResult): RawBusiness {
  // An uncertain pattern must never replace an address already on file.
  const useEmail = !!result.email && (!row.email || (row.emailSource === "Guess" && !result.guessed));
  return { ...row,
    email: useEmail ? result.email : row.email,
    emailSource: useEmail ? (result.guessed ? "Guess" : result.source || "Website") : row.emailSource,
    phone: row.phone || result.phone,
    website: row.website || result.website,
    contactName: row.contactName || result.name || "",
    contactTitle: row.contactTitle || result.title || "",
    linkedin: row.linkedin || result.linkedin || "",
    score: result.score ?? row.score,
    scoreWhy: result.scoreReasons ?? row.scoreWhy,
    ai: result.ai ?? row.ai,
  };
}

type Reply = { job: ScanJobLite | null; produced: EnrichResult[]; claimed?: boolean };
export async function runRawReveal(people: ScanPerson[], deps: {
  start: (people: ScanPerson[]) => Promise<Reply>;
  step: (id: string) => Promise<Reply>;
  status: (id: string) => Promise<ScanJobFull | null>;
  canContinue: () => Promise<boolean>;
  wait: () => Promise<void>;
  onJob: (job: ScanJobLite) => void;
  onRows: (rows: EnrichResult[]) => void;
  onProgress: (done: number, total: number) => void;
}) {
  const warnings = new Set<string>();
  let lastFull = { cursor: -1, at: 0 };
  for (let offset = 0; offset < people.length; offset += 2000) {
    if (!(await deps.canContinue())) break;
    const started = await deps.start(people.slice(offset, offset + 2000));
    let job = started.job;
    deps.onRows(started.produced);
    let failures = 0;
    while (job) {
      deps.onJob(job);
      deps.onProgress(offset + job.cursor, people.length);
      job.warnings.forEach((warning) => warnings.add(warning));
      if (job.last_error) warnings.add(job.last_error);
      if (job.status !== "running" && job.status !== "queued") {
        const full = await deps.status(job.id);
        if (full) deps.onRows(Object.values(full.results));
        if (job.status !== "done") return [...warnings];
        break;
      }
      await deps.wait();
      if (!(await deps.canContinue())) return [...warnings];
      try {
        const next = await deps.step(job.id);
        deps.onRows(next.produced);
        job = next.job;
        if (!(await deps.canContinue())) return [...warnings];
        // Another runner (the background timer) holds the scan right now: read
        // its saved results only when it has moved on, at most every 15 s, and
        // back off ~4 s instead of asking again straight away. Our own rows are
        // already returned; the final read reconciles all saved data.
        if (next.claimed === false && job) {
          if (job.cursor > lastFull.cursor && Date.now() - lastFull.at > 15_000) {
            lastFull = { cursor: job.cursor, at: Date.now() };
            const full = await deps.status(job.id);
            if (full) { deps.onRows(Object.values(full.results)); job = full; }
          }
          for (let i = 0; i < 9; i++) {
            if (!(await deps.canContinue())) return [...warnings];
            await deps.wait();
          }
        }
        failures = 0;
      } catch (error) {
        if (!(await deps.canContinue())) return [...warnings];
        if (++failures >= 4) throw error;
      }
    }
  }
  return [...warnings];
}