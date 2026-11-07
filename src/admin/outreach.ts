/**
 * Client-side data access for the outreach engine.
 * Reads/writes go straight to Supabase (row-level security = team only);
 * anything that needs secrets (OAuth, sending, enrolling, cron) goes through
 * the Worker via authFetch.
 */
import type { LeadAi } from "@/lib/lead-filters";
import { isCompanyDomain } from "@/lib/business-key";
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
/** Columns the server keeps up to date (scheduler heartbeat / timer); a form must never write stale copies back. */
const SERVER_SETTINGS = ["last_cron_at", "last_tick_source", "scheduler_token_hash", "scheduler_url"];
export async function saveOutreachSettings(s: Partial<OutreachSettings>): Promise<void> {
  const row: Record<string, unknown> = { id: "singleton", ...s };
  for (const key of SERVER_SETTINGS) delete row[key];
  must(await (await tbl("outreach_settings")).upsert(row).select("id"));
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
  return id;
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
/** Existing running enrollment emails, read through the authenticated RLS client. */
export async function liveEnrolledEmails(): Promise<Set<string>> {
  const rows = must<{ leads: { email: string | null } | null }[]>(
    await (await tbl("enrollments")).select("leads(email)").in("status", ["queued", "active", "paused"]).limit(10000),
  );
  return new Set(rows.map((row) => (row.leads?.email || "").toLowerCase()).filter(Boolean));
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
  options: { allowGuessed?: boolean; onProgress?: (done: number, total: number) => void } = {},
): Promise<{
  ok: boolean;
  enrolled: number;
  skipped: { email: string; reason: string }[];
  error?: string;
}> {
  // 100 per request: each person is checked against the suppression list and
  // every running sequence, so one huge request used to time out half-way.
  const out = { ok: true, enrolled: 0, skipped: [] as { email: string; reason: string }[], error: undefined as string | undefined };
  for (let i = 0; i < leads.length; i += 100) {
    const res = await authFetch("/api/outreach/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequenceId, leads: leads.slice(i, i + 100), allowGuessed: options.allowGuessed === true }),
    });
    const j = (await res.json().catch(() => null)) as {
      ok: boolean;
      enrolled: number;
      skipped: { email: string; reason: string }[];
      error?: string;
      message?: string;
    } | null;
    if (!j || !j.ok) {
      out.ok = out.enrolled > 0;
      out.error = j?.error || j?.message || `Server answered ${res.status}`;
      break;
    }
    out.enrolled += j.enrolled;
    out.skipped.push(...(j.skipped ?? []));
    options.onProgress?.(Math.min(leads.length, i + 100), leads.length);
  }
  return out;
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
  const clean = email.toLowerCase().trim();
  // The company's domain blocks the whole company — but never gmail.com & co.
  const emailDomain = clean.split("@")[1] || "";
  const domain = isCompanyDomain(emailDomain) ? emailDomain : null;
  // The table is unique on lower(email), which an upsert can't target: look
  // first, insert, and treat "already listed" as done.
  const existing = must<{ id: string }[]>(await (await tbl("suppressions")).select("id").eq("email", clean).limit(1));
  if (existing.length) return;
  const res = await (await tbl("suppressions")).insert({ email: clean, domain, reason, note }).select("id");
  if (res.error?.code === "23505") return;
  must(res);
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

/** Send right now, ignoring the schedule and mailbox hours (daily cap still applies). One call ≈ 25 s. */
export async function sendNow(target: {
  enrollmentIds?: string[];
  sequenceId?: string;
  /** "Send all" rounds: the moment the server fixed for this action (from the first round's answer). */
  frozenAt?: string;
}): Promise<{ ok: boolean; report?: DispatchSummary; error?: string; frozen_at?: string }> {
  const res = await authFetch("/api/outreach/send-now", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(target),
  });
  const body = (await res.json().catch(() => null)) as { ok: boolean; report?: DispatchSummary; error?: string; message?: string; frozen_at?: string } | null;
  if (!body) return { ok: false, error: `Server answered ${res.status}` };
  if (!res.ok && !body.error) return { ok: false, error: body.message || `Server answered ${res.status}` };
  return body;
}
export interface DispatchSummary {
  mailboxes?: {
    email: string;
    sent: number;
    skipped?: string;
    bounce_blocked?: number;
    duplicates_held?: number;
    busy?: boolean;
    due_left?: number;
    next_send_in_sec?: number;
    remaining_today?: number;
    /** Follow-ups waited because the inbox hadn't been read recently (replies/opt-outs first). */
    followups_held?: boolean;
  }[];
  errors?: string[];
}

export const FOLLOWUPS_HELD_NOTE =
  "follow-ups wait until the inbox has been read, so replies and opt-outs are seen first";

export interface SendAllProgress {
  sent: number;
  rounds: number;
  /** People still eligible after the latest call (null = unknown). */
  left: number | null;
  /** Why it stopped / is waiting, in plain words. */
  note: string;
}

/**
 * "Send now to everyone waiting": keeps calling the server (≈ 25 s per call,
 * a few seconds between emails) until every never-emailed person and every
 * due follow-up in the sequence has gone out, the daily cap is reached, or
 * `shouldStop()` says stop. The eligible IDs and their current steps are fixed
 * before sending, so each person gets at
 * most one email per press and people added meanwhile wait for the normal
 * schedule. If the tab closes, the background scheduler finishes the rest at
 * the sequence's normal pace.
 */
export async function sendAllNow(
  sequenceId: string,
  opts: { onProgress?: (p: SendAllProgress) => void; shouldStop?: () => boolean } = {},
): Promise<SendAllProgress & { blocked: number; duplicates: number; errors: string[] }> {
  const out = { sent: 0, rounds: 0, left: null as number | null, note: "", blocked: 0, duplicates: 0, errors: [] as string[] };
  let idle = 0;
  const people = await listEnrollments({ sequenceId, limit: 10000 });
  const start = Date.now();
  const remaining = new Set(people.filter((p) => ["queued", "active", "paused"].includes(p.status) &&
    (p.current_step === 0 || (p.next_send_at && Date.parse(p.next_send_at) <= start))).map((p) => p.id));
  const originalSteps = new Map(people.map((p) => [p.id, p.current_step]));
  if (!remaining.size) return { ...out, left: 0 };
  while (!opts.shouldStop?.()) {
    out.rounds++;
    const batch = [...remaining].slice(0, 200);
    const r = await sendNow({ sequenceId, enrollmentIds: batch });
    if (!r.ok) {
      out.errors.push(r.error || "Could not send");
      if (++idle >= 3) break;
      await new Promise((res) => setTimeout(res, 5000));
      continue;
    }
    // Mailboxes that aren't part of this sequence say so and are ignored here.
    const boxes = (r.report?.mailboxes ?? []).filter((m) => !/isn't used by that sequence/i.test(m.skipped || ""));
    const sent = boxes.reduce((a, m) => a + m.sent, 0);
    out.sent += sent;
    out.blocked += boxes.reduce((a, m) => a + (m.bounce_blocked ?? 0), 0);
    out.duplicates += boxes.reduce((a, m) => a + (m.duplicates_held ?? 0), 0);
    out.errors.push(...(r.report?.errors ?? []).slice(0, 2));
    const current = await listEnrollments({ sequenceId, limit: 10000 });
    const eligible = new Set(current.filter((p) => ["queued", "active", "paused"].includes(p.status) &&
      p.current_step === originalSteps.get(p.id) &&
      (p.current_step === 0 || (p.next_send_at && Date.parse(p.next_send_at) <= start))).map((p) => p.id));
    for (const id of remaining) if (!eligible.has(id)) remaining.delete(id);
    out.left = remaining.size;
    const busy = boxes.some((m) => m.busy);
    // Only a mailbox that SAYS its daily cap is reached counts as capped (a busy
    // mailbox hasn't counted anything yet).
    const capped = boxes.length > 0 && boxes.every((m) => !m.busy && /daily cap/i.test(m.skipped || ""));
    out.note = capped
      ? "Daily cap reached — the rest goes out after midnight."
      : busy
        ? "Background sending is using the mailbox — waiting a moment…"
        : boxes.map((m) => m.skipped).filter(Boolean)[0] ||
          (boxes.some((m) => m.followups_held) ? FOLLOWUPS_HELD_NOTE : "");
    opts.onProgress?.({ sent: out.sent, rounds: out.rounds, left: out.left, note: out.note });
    // A busy mailbox reports nothing about who's left, so "0 left" only counts when none is busy.
    if (capped || (out.left === 0 && !busy)) break;
    if (sent === 0) {
      // Nothing went out this round: a busy mailbox frees up within a minute;
      // anything else (no mailbox, hours, errors) won't change by retrying fast.
      if (++idle >= (busy ? 12 : 2)) break;
      await new Promise((res) => setTimeout(res, busy ? 5000 : 2000));
    } else idle = 0;
  }
  if (opts.shouldStop?.() && remaining.size) out.note = "Stopped after the current round. Remaining people keep their normal schedule.";
  return out;
}

/** Background keep-alive from an open admin tab (the server ignores it while a real scheduler runs). */
export async function browserTick(): Promise<{ ok: boolean; sent?: number; read?: number; skipped?: string | null }> {
  const res = await authFetch("/api/outreach/tick", { method: "POST" });
  return (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; sent?: number; read?: number; skipped?: string | null };
}

export interface SchedulerState {
  ok: boolean;
  enabled?: boolean;
  url?: string | null;
  suggested_url?: string;
  migrated?: boolean | null;
  last_tick_at?: string | null;
  last_tick_source?: string | null;
  error?: string;
}
export async function schedulerStatus(): Promise<SchedulerState> {
  const res = await authFetch("/api/outreach/scheduler");
  return (await res.json().catch(() => ({ ok: false, error: `Server answered ${res.status}` }))) as SchedulerState;
}
export async function setScheduler(enabled: boolean): Promise<SchedulerState> {
  const res = await authFetch("/api/outreach/scheduler", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  return (await res.json().catch(() => ({ ok: false, error: `Server answered ${res.status}` }))) as SchedulerState;
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
