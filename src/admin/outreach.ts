/**
 * Client-side data access for the outreach engine.
 * Reads/writes go straight to Supabase (row-level security = team only);
 * anything that needs secrets (OAuth, sending, enrolling, cron) goes through
 * the Worker via authFetch.
 */
import type { LeadAi } from "@/lib/lead-filters";
import { authFetch } from "./store";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function tbl(name: string): Promise<any> {
  const { supabase } = await import("@/integrations/supabase/client");
  return (supabase as any).from(name);
}

export interface Mailbox {
  id: string;
  email: string;
  display_name: string;
  status: "active" | "paused" | "error";
  daily_cap: number;
  timezone: string;
  window_start: number;
  window_end: number;
  send_days: number[];
  signature: string;
  last_error: string | null;
  last_sync_at: string | null;
  created_at: string;
  provider?: "google" | "ghl" | null;
}

export interface OutreachSettings {
  id: "singleton";
  company_name: string;
  postal_address: string;
  website: string;
  eu_notice: string;
  us_notice: string;
  footer_style?: "sentence" | "block" | null;
  plain_text?: boolean | null;
  optout_line_us?: string | null;
  optout_line_eu?: string | null;
  /** Owner-written instructions used by every AI prompt (emails, pitch lines, reply drafts). */
  ai_instructions?: string | null;
}

export interface Sequence {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "archived";
  mailbox_ids: string[];
  stop_on_reply: boolean;
  gap_min_sec: number;
  gap_max_sec: number;
  /** Ignore mailbox sending hours; start/add sends at once. */
  send_anytime?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface SequenceStep {
  id?: string;
  sequence_id?: string;
  position: number;
  delay_days: number;
  subject: string;
  subject_b?: string;
  body: string;
}

export interface LeadRow {
  id: string;
  company: string;
  domain: string | null;
  website: string | null;
  contact_name: string;
  contact_title: string;
  email: string | null;
  email_source: string;
  email_guessed: boolean;
  email_verified: string;
  phone: string;
  city: string;
  region: "US" | "EU";
  industry: string;
  status: string;
}

export interface Enrollment {
  id: string;
  sequence_id: string;
  lead_id: string;
  mailbox_id: string | null;
  status:
    | "queued"
    | "active"
    | "completed"
    | "replied"
    | "bounced"
    | "unsubscribed"
    | "paused"
    | "failed"
    | "skipped";
  current_step: number;
  next_send_at: string;
  thread_id: string | null;
  last_error: string | null;
  replied_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  leads?: LeadRow;
  sequences?: { name: string };
  mailboxes?: { email: string } | null;
}

export type ReplyIntent =
  "interested" | "later" | "question" | "not_interested" | "wrong_person" | "auto" | "unknown";

export interface Message {
  id: string;
  enrollment_id: string | null;
  lead_id: string | null;
  mailbox_id: string | null;
  direction: "out" | "in";
  step_position: number | null;
  gmail_thread_id: string | null;
  subject: string;
  snippet: string;
  kind: "email" | "reply" | "bounce" | "auto_reply";
  status: "sent" | "failed" | "received";
  error: string | null;
  sent_at: string;
  body_text?: string | null;
  intent?: ReplyIntent | null;
  draft_reply?: string | null;
  handled_at?: string | null;
  from_header?: string | null;
  variant?: string | null;
  leads?: LeadRow | null;
  mailboxes?: { email: string } | null;
}

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
  last_result: {
    found?: number;
    new?: number;
    with_email?: number;
    enrolled?: number;
    errors?: string[];
    sample?: { company: string; email: string; score: number }[];
  } | null;
  created_at: string;
}

export interface Suppression {
  id: string;
  email: string | null;
  domain: string | null;
  reason: string;
  note: string;
  created_at: string;
}

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

/* ------------------------------------------------------------ mailboxes */
export async function listMailboxes(): Promise<Mailbox[]> {
  return must(await (await tbl("mailboxes")).select("*").order("created_at"));
}
export async function updateMailbox(id: string, patch: Partial<Mailbox>): Promise<void> {
  must(await (await tbl("mailboxes")).update(patch).eq("id", id).select("id"));
}
export async function deleteMailbox(id: string): Promise<void> {
  must(await (await tbl("mailboxes")).delete().eq("id", id).select("id"));
}
export async function connectMailboxUrl(): Promise<string> {
  const res = await authFetch("/api/google/oauth/start");
  const j = (await res.json()) as { ok?: boolean; url?: string; error?: string };
  if (!j.ok || !j.url) throw new Error(j.error || "Could not start Google sign-in.");
  return j.url;
}
export async function connectGhl(input: {
  apiKey: string;
  locationId: string;
  companyId?: string;
  fromEmail: string;
  fromName?: string;
}): Promise<{ ok: boolean; id?: string; location?: string; error?: string }> {
  const res = await authFetch("/api/outreach/ghl/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await res.json()) as { ok: boolean; id?: string; location?: string; error?: string };
}
export async function sendTestEmail(
  mailboxId: string,
  to: string,
  region: "US" | "EU",
): Promise<{ ok: boolean; error?: string; preview?: { subject: string; text: string } }> {
  const res = await authFetch("/api/outreach/test-send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mailboxId, to, region }),
  });
  return (await res.json()) as {
    ok: boolean;
    error?: string;
    preview?: { subject: string; text: string };
  };
}

/* ------------------------------------------------------------- settings */
export async function getOutreachSettings(): Promise<OutreachSettings> {
  const rows = must<OutreachSettings[]>(
    await (await tbl("outreach_settings")).select("*").eq("id", "singleton"),
  );
  return (
    rows[0] ?? {
      id: "singleton",
      company_name: "Inspirova Marketing",
      postal_address: "",
      website: "",
      eu_notice: "",
      us_notice: "",
    }
  );
}
export async function saveOutreachSettings(s: Partial<OutreachSettings>): Promise<void> {
  must(await (await tbl("outreach_settings")).upsert({ id: "singleton", ...s }).select("id"));
}
export async function integrationStatus(): Promise<Record<string, boolean>> {
  const res = await authFetch("/api/outreach/status");
  return res.ok ? ((await res.json()) as Record<string, boolean>) : {};
}

/* ------------------------------------------------------------ sequences */
export async function listSequences(): Promise<Sequence[]> {
  return must(
    await (
      await tbl("sequences")
    )
      .select("*")
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
  );
}
/** position count per sequence, for "sent 2 of 3" displays. */
export async function stepCounts(): Promise<Record<string, number>> {
  const rows = must<{ sequence_id: string }[]>(
    await (await tbl("sequence_steps")).select("sequence_id"),
  );
  return rows.reduce(
    (a, r) => ({ ...a, [r.sequence_id]: (a[r.sequence_id] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
}
export async function listSteps(sequenceId: string): Promise<SequenceStep[]> {
  return must(
    await (await tbl("sequence_steps")).select("*").eq("sequence_id", sequenceId).order("position"),
  );
}
export async function saveSequence(
  seq: Partial<Sequence> & { id?: string },
  steps: SequenceStep[],
): Promise<string> {
  const t = await tbl("sequences");
  const row = {
    name: seq.name,
    status: seq.status ?? "draft",
    mailbox_ids: seq.mailbox_ids ?? [],
    stop_on_reply: seq.stop_on_reply ?? true,
    gap_min_sec: seq.gap_min_sec ?? 45,
    gap_max_sec: seq.gap_max_sec ?? 180,
    send_anytime: seq.send_anytime ?? true,
  };
  let id = seq.id;
  if (id) must(await t.update(row).eq("id", id).select("id"));
  else id = must<{ id: string }[]>(await t.insert(row).select("id"))[0].id;
  const st = await tbl("sequence_steps");
  must(await st.delete().eq("sequence_id", id).select("id"));
  if (steps.length)
    must(
      await st
        .insert(
          steps.map((s, i) => ({
            sequence_id: id,
            position: i,
            delay_days: i === 0 ? 0 : Math.max(1, s.delay_days),
            subject: s.subject,
            body: s.body,
          })),
        )
        .select("id"),
    );
  return id!;
}
export async function setSequenceStatus(id: string, status: Sequence["status"]): Promise<void> {
  must(await (await tbl("sequences")).update({ status }).eq("id", id).select("id"));
}
/** Delete a sequence with its steps, enrollments and their message log (DB cascades). */
export async function deleteSequence(id: string): Promise<void> {
  must(await (await tbl("sequences")).delete().eq("id", id).select("id"));
}

/* ---------------------------------------------------------- enrollments */
export async function listEnrollments(
  opts: { sequenceId?: string; status?: string; limit?: number } = {},
): Promise<Enrollment[]> {
  let q = (await tbl("enrollments"))
    .select("*, leads(*), sequences(name), mailboxes(email)")
    .order("updated_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.sequenceId) q = q.eq("sequence_id", opts.sequenceId);
  if (opts.status) q = q.eq("status", opts.status);
  return must(await q);
}
/** A/B results per sequence: how many enrolments per subject variant, and how many replied. */
export async function abStats(
  sequenceId: string,
): Promise<Record<"A" | "B", { sent: number; replied: number }>> {
  const rows = must<{ variant: "A" | "B"; status: string; current_step: number }[]>(
    await (
      await tbl("enrollments")
    )
      .select("variant,status,current_step")
      .eq("sequence_id", sequenceId),
  );
  const out = { A: { sent: 0, replied: 0 }, B: { sent: 0, replied: 0 } };
  for (const r of rows) {
    const v = r.variant === "B" ? "B" : "A";
    if (r.current_step > 0 || r.status === "replied") out[v].sent++;
    if (r.status === "replied") out[v].replied++;
  }
  return out;
}
/** Per-sequence people counts: { [sequenceId]: { total, queued, active, completed, replied, bounced, ... } } */
export async function sequenceCounts(): Promise<Record<string, Record<string, number>>> {
  const rows = must<{ sequence_id: string; status: string }[]>(
    await (await tbl("enrollments")).select("sequence_id,status").limit(10000),
  );
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const o = (out[r.sequence_id] ??= { total: 0 });
    o[r.status] = (o[r.status] ?? 0) + 1;
    o.total++;
  }
  return out;
}

export async function enrollmentCounts(): Promise<Record<string, number>> {
  const rows = must<{ status: string }[]>(await (await tbl("enrollments")).select("status"));
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
  out.total = rows.length;
  return out;
}
export async function updateEnrollment(id: string, patch: Partial<Enrollment>): Promise<void> {
  must(await (await tbl("enrollments")).update(patch).eq("id", id).select("id"));
}
export async function deleteEnrollment(id: string): Promise<void> {
  must(await (await tbl("enrollments")).delete().eq("id", id).select("id"));
}

export interface EnrollInput {
  company: string;
  website?: string;
  contactName?: string;
  contactTitle?: string;
  email: string;
  emailSource?: string;
  emailGuessed?: boolean;
  phone?: string;
  linkedin?: string;
  city?: string;
  region?: "US" | "EU";
  industry?: string;
  source?: string;
  rawId?: string;
  score?: number;
  scoreReasons?: string[];
  ai?: LeadAi | null;
}
export async function enrollLeads(
  sequenceId: string,
  leads: EnrollInput[],
): Promise<{
  ok: boolean;
  enrolled: number;
  skipped: { email: string; reason: string }[];
  error?: string;
}> {
  const res = await authFetch("/api/outreach/enroll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sequenceId, leads }),
  });
  return (await res.json()) as {
    ok: boolean;
    enrolled: number;
    skipped: { email: string; reason: string }[];
    error?: string;
  };
}

/** "Write with AI" for one sequence step. Uses Settings → AI instructions. */
export async function aiWriteStep(input: {
  sequenceName: string;
  audience?: string;
  index: number;
  previous: { subject: string; body: string }[];
  current?: { subject?: string; body?: string };
  extra?: string;
}): Promise<{ subject: string; subject_b: string; body: string }> {
  const res = await authFetch("/api/outreach/ai/write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const j = (await res.json()) as {
    ok: boolean;
    step?: { subject: string; subject_b: string; body: string };
    error?: string;
  };
  if (!j.ok || !j.step) throw new Error(j.error || "Could not write the email");
  return j.step;
}

/* ------------------------------------------------------------- messages */
export async function listMessages(
  opts: { direction?: "in" | "out"; kind?: string; limit?: number; enrollmentId?: string } = {},
): Promise<Message[]> {
  let q = (await tbl("messages"))
    .select("*, leads(*), mailboxes(email)")
    .order("sent_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.direction) q = q.eq("direction", opts.direction);
  if (opts.kind) q = q.eq("kind", opts.kind);
  if (opts.enrollmentId) q = q.eq("enrollment_id", opts.enrollmentId);
  return must(await q);
}
export async function sentCounts(
  days = 14,
): Promise<{ day: string; sent: number; replies: number }[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = must<{ direction: string; kind: string; sent_at: string }[]>(
    await (await tbl("messages")).select("direction,kind,sent_at").gte("sent_at", since),
  );
  const map = new Map<string, { sent: number; replies: number }>();
  for (let i = days - 1; i >= 0; i--)
    map.set(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10), {
      sent: 0,
      replies: 0,
    });
  for (const r of rows) {
    const d = r.sent_at.slice(0, 10);
    const e = map.get(d);
    if (!e) continue;
    if (r.direction === "out") e.sent++;
    else if (r.kind === "reply") e.replies++;
  }
  return Array.from(map.entries()).map(([day, v]) => ({ day, ...v }));
}

/* --------------------------------------------------------- suppressions */
export async function listSuppressions(): Promise<Suppression[]> {
  return must(
    await (
      await tbl("suppressions")
    )
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
  );
}
export async function addSuppression(email: string, reason = "manual", note = ""): Promise<void> {
  const domain = email.split("@")[1] || null;
  must(
    await (
      await tbl("suppressions")
    )
      .upsert({ email: email.toLowerCase().trim(), domain, reason, note }, { onConflict: "email" })
      .select("id"),
  );
}
export async function removeSuppression(id: string): Promise<void> {
  must(await (await tbl("suppressions")).delete().eq("id", id).select("id"));
}

/* ----------------------------------------------------------------- cron */
export async function runDispatchNow(
  syncOnly = false,
): Promise<{ ok: boolean; report?: unknown; error?: string }> {
  const res = await authFetch(`/api/cron/dispatch${syncOnly ? "?sync=1" : ""}`);
  return (await res.json()) as { ok: boolean; report?: unknown; error?: string };
}

/** Send right now, ignoring the schedule and mailbox hours (daily cap still applies). */
export async function sendNow(target: {
  enrollmentIds?: string[];
  sequenceId?: string;
}): Promise<{ ok: boolean; report?: DispatchSummary; error?: string }> {
  const res = await authFetch("/api/outreach/send-now", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(target),
  });
  return (await res.json()) as { ok: boolean; report?: DispatchSummary; error?: string };
}
export interface DispatchSummary {
  mailboxes?: { email: string; sent: number; skipped?: string; bounce_blocked?: number }[];
  errors?: string[];
}

/* -------------------------------------------------------------- replies */
export async function sendReply(
  messageId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await authFetch("/api/outreach/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId, text }),
  });
  return (await res.json()) as { ok: boolean; error?: string };
}
export async function markHandled(messageId: string, handled = true): Promise<void> {
  must(
    await (
      await tbl("messages")
    )
      .update({ handled_at: handled ? new Date().toISOString() : null })
      .eq("id", messageId)
      .select("id"),
  );
}

/* ------------------------------------------------------- saved searches */
export async function listSavedSearches(): Promise<SavedSearch[]> {
  return must(
    await (await tbl("saved_searches")).select("*").order("created_at", { ascending: false }),
  );
}
export async function saveSavedSearch(s: Partial<SavedSearch> & { id?: string }): Promise<string> {
  const t = await tbl("saved_searches");
  const row: Record<string, unknown> = {
    name: s.name,
    location: s.location,
    industry: s.industry ?? "",
    per_page: s.per_page ?? 25,
    providers: s.providers ?? ["places", "serper", "osm"],
    geo: s.geo ?? null,
    region: s.region ?? "US",
    min_score: s.min_score ?? 40,
    filters: s.filters ?? {},
    auto_enroll_sequence_id: s.auto_enroll_sequence_id ?? null,
    schedule: s.schedule ?? "weekly",
  };
  if (s.schedule && s.schedule !== "off")
    row.next_run_at = s.next_run_at ?? new Date().toISOString();
  if (s.schedule === "off") row.next_run_at = null;
  if (s.id) {
    must(await t.update(row).eq("id", s.id).select("id"));
    return s.id;
  }
  return must<{ id: string }[]>(await t.insert(row).select("id"))[0].id;
}
export async function deleteSavedSearch(id: string): Promise<void> {
  must(await (await tbl("saved_searches")).delete().eq("id", id).select("id"));
}
export async function runSavedSearchNow(
  id: string,
): Promise<{ ok: boolean; result?: SavedSearch["last_result"]; error?: string }> {
  const res = await authFetch("/api/outreach/search/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return (await res.json()) as { ok: boolean; result?: SavedSearch["last_result"]; error?: string };
}
