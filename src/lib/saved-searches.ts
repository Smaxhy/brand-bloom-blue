/**
 * Saved searches — "roofers within 25 km of Littleton", re-run on a schedule.
 *
 * Each run: discover → drop anything this search has already seen or that is
 * already a lead → read each new website (free) + Claude for the owner →
 * score → upsert as a lead (status "new") → optionally enroll the ones that
 * clear the minimum score into a sequence. Bounded per run so a cron tick
 * never does more than ~30 websites.
 */

import { Db, enc } from "./db";
import { discoverCore, type DiscoverFilters } from "./api-proxies";
import { scoreLead } from "./providers/free-enrich";
import { enrichSite, enrichMany } from "./enrich-site";
import { leadFilterReason } from "./lead-filters";

type Env = Record<string, string | undefined>;
const secret = (e: Env, k: string) => e[k] || process.env?.[k];

export interface SavedSearch {
  id: string;
  name: string;
  location: string;
  industry: string;
  per_page: number;
  providers: string[];
  geo: { lat?: number; lng?: number; bbox?: [number, number, number, number] } | null;
  region: "US" | "EU";
  min_score: number;
  filters?: {
    radiusKm?: number;
    minRating?: number;
    minReviews?: number;
    maxReviews?: number;
    seniorities?: string[];
    teamSizes?: string[];
    revenueBands?: string[];
  } | null;
  auto_enroll_sequence_id: string | null;
  schedule: "off" | "daily" | "weekly";
  next_run_at: string | null;
  last_run_at: string | null;
  created_by: string | null;
}

export interface SearchRunResult {
  ran_at: string;
  found: number;
  new: number;
  enriched: number;
  with_email: number;
  enrolled: number;
  skipped_low_score: number;
  errors: string[];
  sample: { company: string; email: string; score: number }[];
}

// With the 30-day site cache and 6-wide concurrency this fits comfortably in one cron tick.
const MAX_ENRICH_PER_RUN = 60;

function cleanDomain(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}

export async function runSavedSearch(env: Env, db: Db, ss: SavedSearch): Promise<SearchRunResult> {
  const out: SearchRunResult = {
    ran_at: new Date().toISOString(),
    found: 0,
    new: 0,
    enriched: 0,
    with_email: 0,
    enrolled: 0,
    skipped_low_score: 0,
    errors: [],
    sample: [],
  };

  const filters: DiscoverFilters = {
    location: ss.location,
    industry: ss.industry,
    perPage: ss.per_page,
    providers: ss.providers as DiscoverFilters["providers"],
    lat: ss.geo?.lat,
    lng: ss.geo?.lng,
    bbox: ss.geo?.bbox,
    apifyWait: true,
    radiusKm: ss.filters?.radiusKm || undefined,
    minRating: ss.filters?.minRating || undefined,
    minReviews: ss.filters?.minReviews || undefined,
    maxReviews: ss.filters?.maxReviews || undefined,
  };
  const disc = await discoverCore(filters, env);
  out.errors.push(...disc.errors);
  out.found = disc.businesses.length;
  if (!disc.businesses.length) return out;

  // What have we seen before (this search) and what is already a lead?
  const keys = disc.businesses.map(
    (b) =>
      cleanDomain(b.website) || `${b.company.toLowerCase()}|${(b.phone || "").replace(/\D/g, "")}`,
  );
  const seen = new Set(
    (
      await db.select<{ key: string }>(
        "search_seen",
        `search_id=eq.${ss.id}&key=in.(${keys.map((k) => `"${k.replace(/"/g, "")}"`).join(",")})&select=key`,
      )
    ).map((r) => r.key),
  );
  const domains = keys.filter((k) => k.includes(".") && !k.includes("|"));
  const existingLeads = domains.length
    ? new Set(
        (
          await db.select<{ domain: string }>(
            "leads",
            `domain=in.(${domains.map((d) => `"${d}"`).join(",")})&select=domain`,
          )
        ).map((r) => r.domain),
      )
    : new Set<string>();

  const fresh = disc.businesses.filter((b, i) => !seen.has(keys[i]) && !existingLeads.has(keys[i]));
  out.new = fresh.length;
  // Mark everything as seen (even the ones we don't enrich this run get retried next time? No — only mark enriched ones).

  const todo = fresh.slice(0, MAX_ENRICH_PER_RUN);
  const seq = ss.auto_enroll_sequence_id
    ? await db.one<{ id: string; mailbox_ids: string[]; status: string }>(
        "sequences",
        `id=eq.${ss.auto_enroll_sequence_id}&select=id,mailbox_ids,status`,
      )
    : null;
  let i = 0;

  const profiles = new Map<string, Awaited<ReturnType<typeof enrichSite>>>();
  await enrichMany(todo, 6, async (b) => {
    const website = cleanDomain(b.website);
    if (!website) return;
    const prof = await enrichSite(env, {
      website,
      company: b.company,
      industry: b.industry || ss.industry,
      city: b.city || ss.location,
      rating: b.rating,
      reviews: b.reviews,
      db,
    });
    if (prof) {
      profiles.set(b.id, prof);
      out.enriched++;
    }
  });

  for (const b of todo) {
    const key =
      cleanDomain(b.website) || `${b.company.toLowerCase()}|${(b.phone || "").replace(/\D/g, "")}`;
    try {
      const prof = profiles.get(b.id) || null;
      const website = prof?.website || cleanDomain(b.website);
      const email = prof?.email || "";
      const guessed = !!prof?.emailGuessed;
      const name = prof?.name || "";
      const title = prof?.title || "";
      const mx: boolean | null = prof?.mx ?? null;
      const signals = prof?.signals ?? null;
      const linkedin = prof?.linkedin || "";
      const phone = b.phone || prof?.phone || "";
      const sc = scoreLead({
        rating: b.rating,
        reviews: b.reviews,
        website,
        name,
        email,
        emailGuessed: guessed,
        mx,
        phone,
        signals,
        aiNeed: prof?.ai?.need ?? null,
      });
      if (email) out.with_email++;

      const [lead] = email
        ? await db.upsert<{ id: string }>(
            "leads",
            {
              company: b.company,
              domain: website || null,
              website: website || null,
              contact_name: name,
              contact_title: title,
              email: email.toLowerCase(),
              email_source: guessed ? "Guess" : "Website",
              email_guessed: guessed,
              email_verified: mx ? "mx_ok" : "unknown",
              phone,
              linkedin,
              city: b.city || b.address,
              region: ss.region,
              industry: b.industry,
              source: `Saved search: ${ss.name}`,
              place_id: b.id,
              status: "new",
              score: sc.score,
              score_reasons: sc.reasons,
              signals: { ...(signals ?? {}), ai: prof?.ai ?? undefined },
              created_by: ss.created_by,
            },
            "email",
          )
        : await db.insert<{ id: string }>("leads", {
            company: b.company,
            domain: website || null,
            website: website || null,
            contact_name: name,
            contact_title: title,
            email: null,
            phone,
            linkedin,
            city: b.city || b.address,
            region: ss.region,
            industry: b.industry,
            source: `Saved search: ${ss.name}`,
            place_id: b.id,
            status: "new",
            score: sc.score,
            score_reasons: sc.reasons,
            signals: { ...(signals ?? {}), ai: prof?.ai ?? undefined },
            created_by: ss.created_by,
          });

      if (out.sample.length < 8) out.sample.push({ company: b.company, email, score: sc.score });

      const filteredOut = leadFilterReason(
        { title, teamSize: prof?.ai?.teamSize, revenueBand: prof?.ai?.revenueBand },
        {
          seniorities: ss.filters?.seniorities,
          teamSizes: ss.filters?.teamSizes,
          revenueBands: ss.filters?.revenueBands,
        },
      );
      if (seq && email && sc.score >= ss.min_score && !filteredOut) {
        const sup = await db.one(
          "suppressions",
          `or=(email.eq.${enc(email.toLowerCase())},domain.eq.${enc(website)})&select=id`,
        );
        const dup = await db.one(
          "enrollments",
          `sequence_id=eq.${seq.id}&lead_id=eq.${lead.id}&select=id`,
        );
        if (!sup && !dup) {
          const mailboxId = seq.mailbox_ids.length
            ? seq.mailbox_ids[i % seq.mailbox_ids.length]
            : null;
          await db.insert("enrollments", {
            sequence_id: seq.id,
            lead_id: lead.id,
            mailbox_id: mailboxId,
            status: "queued",
            current_step: 0,
            next_send_at: new Date(Date.now() + i * 5 * 60_000).toISOString(),
            variant: Math.random() < 0.5 ? "A" : "B",
            created_by: ss.created_by,
          });
          out.enrolled++;
          i++;
        }
      } else if (seq && email) {
        out.skipped_low_score++;
      }
    } catch (err) {
      out.errors.push(`${b.company}: ${(err as Error).message.slice(0, 160)}`);
    }
    await db
      .upsert("search_seen", { search_id: ss.id, key, company: b.company }, "search_id,key")
      .catch(() => {});
  }
  return out;
}

/** Run every saved search whose next_run_at has passed. Called from the cron. */
export async function runDueSavedSearches(
  env: Env,
  db: Db,
): Promise<{ ran: string[]; errors: string[] }> {
  const res = { ran: [] as string[], errors: [] as string[] };
  const due = await db.select<SavedSearch>(
    "saved_searches",
    `schedule=neq.off&next_run_at=lte.${enc(new Date().toISOString())}&select=*&order=next_run_at.asc&limit=3`,
  );
  for (const ss of due) {
    try {
      // Claim it first so two overlapping crons don't both run it.
      const next = new Date(
        Date.now() + (ss.schedule === "daily" ? 1 : 7) * 86_400_000,
      ).toISOString();
      await db.update("saved_searches", `id=eq.${ss.id}&next_run_at=eq.${enc(ss.next_run_at!)}`, {
        next_run_at: next,
      });
      const r = await runSavedSearch(env, db, ss);
      await db.update("saved_searches", `id=eq.${ss.id}`, {
        last_run_at: r.ran_at,
        last_result: r,
      });
      res.ran.push(ss.name);
    } catch (err) {
      res.errors.push(`${ss.name}: ${(err as Error).message}`);
    }
  }
  return res;
}
