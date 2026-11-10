/**
 * Sequencer — sends due outreach steps. Runs from:
 *   - the Cloudflare cron (every minute; the run fills the time until the next tick),
 *   - the database timer (pg_cron → /api/cron/tick, every minute),
 *   - an open admin tab (browser keep-alive, only when nothing else ran recently),
 *   - "Send now" (force: ignores the schedule, gaps of a few seconds).
 *
 * Each run, for every active mailbox IN PARALLEL:
 *   1. Inbox sync (at most every 5 min; a sync failure never blocks sending).
 *   2. Daily cap left today, sending hours ("Send any time" sequences ignore them).
 *   3. Take the mailbox's send lease, so two runners never send from it at once.
 *   4. Due people, oldest first. Each one: atomic claim → suppression / duplicate /
 *      bounce checks → wait out the sequence gap INSIDE the run when it fits →
 *      send → log → schedule the next step. A run that dies mid-send can never
 *      resend blindly: the attempt is marked first and checked on the next pick-up.
 *
 * First emails stuck on a paused or disconnected mailbox are handed to the
 * sequence's other mailboxes automatically.
 */

import { Db, enc, pgQuote } from "./db";
import { accessTokenFor } from "./google-oauth";
import { sendVia, isGhl, threadState, type ThreadState } from "./channel";
import { syncGhlMailbox } from "./ghl-sync";
import {
  gmailSend,
  gmailListAll,
  gmailGetHeaders,
  GMAIL_BOUNCE_QUERY,
  newMessageId,
  isBounce,
  isAutoReply,
  wantsToStop,
} from "./gmail";
import { renderStep } from "./templates";
import { gmailGetFull } from "./gmail";
import { classifyReply } from "./reply-ai";
import { preSendCheck, classifyBounce, applyHardBounce, applySoftBounce, isInvalidRecipientError } from "./bounce";
import {
  dispatchBudgetMs,
  fitsDispatchBudget,
  gapWaitMs,
  pickGapSeconds,
  type DispatchSource,
} from "./dispatch-pacing";
import { acquireLease, renewLease, releaseLease, type Lease } from "./lease";
import {
  withTimeout,
  isMailboxAuthError,
  isPermanentMailboxError,
  isRateLimited,
  isRecipientRefusal,
  certainlyNotSent,
} from "./send-errors";
import { applyReply, enrollmentForThread } from "./reply-actions";
import { cleanDomain, isCompanyDomain } from "./business-key";
import { companyAlreadyContacted } from "./company-contact";

type Env = Record<string, string | undefined>;

export interface Mailbox {
  last_error?: string | null;
  id: string;
  email: string;
  display_name: string;
  status: string;
  daily_cap: number;
  timezone: string;
  window_start: number;
  window_end: number;
  send_days: number[];
  signature: string;
  last_sync_at: string | null;
  provider?: string | null; // 'google' | 'ghl'
}

export interface Lead {
  id: string;
  company: string;
  domain: string | null;
  website: string | null;
  contact_name: string;
  contact_title: string;
  email: string | null;
  email_guessed: boolean;
  email_verified: string;
  phone: string;
  city: string;
  region: "US" | "EU";
  industry: string;
  score?: number | null;
  signals?: { ai?: { need?: number; reasons?: string[]; pitch?: string; gap?: string } } | null;
}

export interface Sequence {
  id: string;
  name: string;
  status: string;
  mailbox_ids: string[];
  stop_on_reply: boolean;
  gap_min_sec: number;
  gap_max_sec: number;
  /** Ignore the mailbox's sending hours/days for this sequence. */
  send_anytime?: boolean | null;
}

export interface Step {
  id: string;
  sequence_id: string;
  position: number;
  delay_days: number;
  subject: string;
  subject_b?: string;
  body: string;
}

export interface Enrollment {
  id: string;
  sequence_id: string;
  lead_id: string;
  mailbox_id: string | null;
  status: string;
  current_step: number;
  next_send_at: string;
  thread_id: string | null;
  first_message_id: string | null;
  unsub_token: string;
  variant?: "A" | "B";
}

export interface OutreachSettings {
  company_name: string;
  postal_address: string;
  website: string;
  eu_notice: string;
  us_notice: string;
  /** 'sentence' = one plain line after the signature (lands in Primary); 'block' = classic grey footer. */
  footer_style?: "sentence" | "block" | null;
  /** Send text-only (no HTML part). Strongly recommended for cold outreach. */
  plain_text?: boolean | null;
  optout_line_us?: string | null;
  optout_line_eu?: string | null;
  /** Owner-written instructions for every AI prompt (what we sell, tone). */
  ai_instructions?: string | null;
}

/** Local time parts for a timezone without any library. */
export function localParts(tz: string, d = new Date()): { hour: number; day: number; ymd: string } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return {
      hour: Number(get("hour")) % 24,
      day: days.indexOf(get("weekday")),
      ymd: `${get("year")}-${get("month")}-${get("day")}`,
    };
  } catch {
    return { hour: d.getUTCHours(), day: d.getUTCDay(), ymd: d.toISOString().slice(0, 10) };
  }
}

/** Start of the mailbox's local day, as an ISO instant (approximate via offset probing). */
export function startOfLocalDayIso(tz: string): string {
  const now = new Date();
  const { ymd } = localParts(tz, now);
  // Every time zone's midnight falls on a quarter hour (UTC+5:30, +5:45, DST…):
  // start at this quarter hour and step back 15 min while it's still "today".
  let t = Math.floor(now.getTime() / 900_000) * 900_000;
  for (let i = 0; i < 30 * 4; i++) {
    if (localParts(tz, new Date(t - 900_000)).ymd !== ymd) break;
    t -= 900_000;
  }
  return new Date(t).toISOString();
}

export function inWindow(mb: Mailbox): boolean {
  const { hour, day } = localParts(mb.timezone);
  return mb.send_days.includes(day) && hour >= mb.window_start && hour < mb.window_end;
}

/** Next instant that's inside the mailbox window, at least `afterMs` from now, plus jitter. */
export function nextWindowTime(mb: Mailbox, afterMs: number): Date {
  let t = new Date(Date.now() + afterMs);
  for (let i = 0; i < 24 * 14; i++) {
    const { hour, day } = localParts(mb.timezone, t);
    if (mb.send_days.includes(day) && hour >= mb.window_start && hour < mb.window_end) return t;
    t = new Date(t.getTime() + 3600_000); // step an hour
    t.setUTCMinutes(Math.floor(Math.random() * 50), 0, 0);
  }
  return t;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.floor(Math.random() * Math.max(1, b - a));

export interface DispatchReport {
  ran_at: string;
  source?: DispatchSource;
  budget_ms?: number;
  mailboxes: {
    email: string;
    sent: number;
    remaining_today: number;
    skipped?: string;
    /** Another runner (cron, timer, another tab) is sending from this mailbox right now. */
    busy?: boolean;
    /** Force runs: how many of the chosen people are still eligible after this call. */
    due_left?: number;
    /** Seconds until this mailbox's next email is allowed by the sequence gap. */
    next_send_in_sec?: number;
    /** Addresses the pre-send bounce check refused this run. */
    bounce_blocked?: number;
    /** Held back because another sequence already emails this person. */
    duplicates_held?: number;
    /** Follow-ups held because the inbox couldn't be read recently (replies/opt-outs first). */
    followups_held?: boolean;
    /** Follow-ups not sent because the person had already replied (seen in the conversation itself). */
    replies_caught?: number;
    synced?: { replies: number; bounces: number; stops: number; partial?: boolean };
    sync_error?: string;
  }[];
  errors: string[];
  /** First emails moved off paused / disconnected mailboxes this run. */
  reassigned?: number;
}

export interface ForceSend {
  /** Send these enrollments right now, ignoring their scheduled time and the mailbox hours. */
  enrollmentIds?: string[];
  /** …or everyone waiting in this sequence: never-emailed people plus follow-ups that are due. */
  sequenceId?: string;
  /**
   * Sequence sends: the moment the bulk action started. Only people enrolled
   * by then, and only follow-ups/retries already due by then, are part of it —
   * the set of people is fixed when the button is pressed, and each of them
   * gets at most one email per action.
   */
  frozenAt?: string;
}

export interface DispatchOptions {
  maxPerRun?: number;
  origin?: string;
  syncOnly?: boolean;
  force?: ForceSend;
  source?: DispatchSource;
  /** Overrides the default time budget for this run. */
  budgetMs?: number;
  /** Cron only: ms since the previous automatic run, to size the budget. */
  sinceLastRunMs?: number | null;
  /** Gap (seconds, min–max) between "Send now" emails. Default 3–8 s. */
  forceGapSec?: [number, number];
}

/** The database refused this request (bad value), as opposed to being unreachable. */
function isDbRefusal(msg: string): boolean {
  return /^db \w+ [\w.]+: (400|404|406|409|413|414|422)\b/.test(msg);
}

/** Time we keep free for one send + its bookkeeping before the budget runs out. */
const SEND_RESERVE_MS = 6_000;
/** Inbox sync at most this often per mailbox on automatic runs. */
const SYNC_EVERY_MS = 5 * 60_000;
/** Follow-ups only go out if the inbox was read successfully this recently. */
const INBOX_FRESH_MS = 10 * 60_000;
const SENDING_MARK = "sending step ";
const VALID_ID = /^[0-9a-f-]{36}$/i;

/** First emails sitting on a mailbox that can't send (paused, error, removed from the sequence) go back to the shared pool. */
async function reassignStranded(db: Db, sequences: Sequence[], activeIds: Set<string>): Promise<number> {
  let moved = 0;
  for (const s of sequences) {
    if (s.status !== "active") continue;
    const live = (s.mailbox_ids || []).filter((id) => activeIds.has(id) && VALID_ID.test(id));
    if (!live.length) continue;
    const rows = await db.update<{ id: string }>(
      "enrollments",
      `sequence_id=eq.${s.id}&status=in.(queued,active)&current_step=eq.0&mailbox_id=not.in.(${live.join(",")})&or=(last_error.is.null,last_error.not.like.${enc(`${SENDING_MARK}*`)})&select=id`,
      { mailbox_id: null },
    );
    moved += rows.length;
  }
  return moved;
}

export async function runDispatch(env: Env, opts: DispatchOptions = {}): Promise<DispatchReport> {
  const db = new Db(env);
  const source: DispatchSource = opts.source ?? "manual";
  const force = opts.force;
  const runStart = Date.now();
  const budget = opts.budgetMs ?? dispatchBudgetMs(source, opts.sinceLastRunMs);
  const report: DispatchReport = {
    ran_at: new Date(runStart).toISOString(),
    source,
    budget_ms: budget,
    mailboxes: [],
    errors: [],
  };
  const maxPerRun = Math.max(1, opts.maxPerRun ?? (force ? 40 : 200));
  const left = () => budget - (Date.now() - runStart);

  const [allMailboxes, settingsRow] = await Promise.all([
    db.select<Mailbox>("mailboxes", "select=*&order=created_at.asc"),
    db.one<OutreachSettings>("outreach_settings", "id=eq.singleton&select=*"),
  ]);
  const mailboxes = allMailboxes.filter((m) => m.status === "active");
  const settings: OutreachSettings = settingsRow ?? {
    company_name: "Inspirova Marketing",
    postal_address: "",
    website: "",
    eu_notice: "",
    us_notice: "",
  };
  // Forced sends also work from paused/draft sequences (follow-ups still wait
  // for the sequence to be active).
  const sequences = await db.select<Sequence>(
    "sequences",
    force ? "status=neq.archived&select=*" : "status=eq.active&select=*",
  );
  const seqById = new Map(sequences.map((s) => [s.id, s]));
  const stepsBySeq = new Map<string, Promise<Step[]>>();
  const stepsOf = (seqId: string) => {
    let p = stepsBySeq.get(seqId);
    if (!p) {
      p = db.select<Step>("sequence_steps", `sequence_id=eq.${seqId}&select=*&order=position.asc`);
      stepsBySeq.set(seqId, p);
      // A failed read must not poison every later person of this run.
      p.catch(() => stepsBySeq.delete(seqId));
    }
    return p;
  };

  if (!force && !opts.syncOnly) {
    try {
      report.reassigned = await reassignStranded(db, sequences, new Set(mailboxes.map((m) => m.id)));
    } catch (err) {
      report.errors.push(`reassign: ${(err as Error).message}`);
    }
  }

  // Unsubscribe links must point at the real site: the configured public
  // origin wins; an editor/preview address is never put into an email.
  const requestOrigin = opts.origin && !/(^|\/\/)(id-)?preview--|lovableproject|localhost|127\.0\.0\.1/i.test(opts.origin) ? opts.origin : "";
  const unsubBase = (env.PUBLIC_ORIGIN || process.env?.PUBLIC_ORIGIN || requestOrigin || "https://inspirovamarketing.com").replace(/\/+$/, "");

  async function runMailbox(mb: Mailbox, entry: DispatchReport["mailboxes"][number]) {
    let lease: Lease | null = null;
    // When the inbox was last read successfully. Follow-ups only go out while
    // this is recent, so a reply or "stop" can never be missed (fail-closed);
    // first emails don't depend on it.
    let syncedAt = mb.last_sync_at ? Date.parse(mb.last_sync_at) : 0;
    try {
      // --- inbox sync: at most every 5 min per mailbox; a failure holds follow-ups only ---
      // "Send now" reads the inbox too when the last read is older than 10 min, so
      // a manual follow-up can't go to someone whose reply or "stop" is still unread.
      if (!force || Date.now() - syncedAt >= INBOX_FRESH_MS) {
        const syncLease = opts.syncOnly
          ? null
          : await acquireLease(db, `sync:${mb.id}`, SYNC_EVERY_MS).catch(() => null);
        if (opts.syncOnly || syncLease) {
          const syncMs = opts.syncOnly ? 45_000 : Math.max(5_000, Math.min(20_000, left() - 10_000));
          try {
            const synced = await withTimeout(syncMailbox(env, db, mb, Date.now() + syncMs), syncMs + 8_000, "inbox sync");
            entry.synced = synced;
            if (!synced.partial) syncedAt = Date.now();
            // A partial pass is finished on the next run, not 5 minutes later.
            else await releaseLease(db, syncLease);
          } catch (err) {
            await releaseLease(db, syncLease); // try again on the next run
            const msg = (err as Error).message;
            entry.sync_error = msg.slice(0, 200);
            report.errors.push(`${mb.email} inbox sync: ${msg.slice(0, 200)}`);
            if (isPermanentMailboxError(msg)) {
              await markMailboxBroken(mb, msg);
              entry.skipped = "connection lost — reconnect this mailbox in Settings";
              return;
            }
          }
        }
      }
      if (opts.syncOnly) return;

      const seqsHere = sequences.filter((s) => s.mailbox_ids.includes(mb.id));
      const outsideHours = !force && !inWindow(mb);
      const allowedNow = (list: Sequence[]) => (outsideHours ? list.filter((s) => s.send_anytime) : list).map((s) => s.id);
      // People already assigned to this mailbox keep their mailbox (their thread
      // lives there) even if it was later removed from the sequence's list.
      const ownSeqIds = force ? [] : allowedNow(sequences);
      if (!seqsHere.length && !ownSeqIds.length) {
        entry.skipped = "no active sequence uses this mailbox";
        return;
      }
      const dueSeqIds = allowedNow(seqsHere);
      if (!dueSeqIds.length && !ownSeqIds.length) {
        entry.skipped = `outside send hours (${String(mb.window_start).padStart(2, "0")}:00–${String(mb.window_end).padStart(2, "0")}:00 ${mb.timezone}${mb.send_days.length < 7 ? ", " + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].filter((_, i) => mb.send_days.includes(i)).join("/") : ""}) — tick "Send any time" on the sequence or use Send now`;
        return;
      }

      // Only one sender per mailbox at a time (cron, database timer, open tab, Send now).
      try {
        lease = await acquireLease(db, `send:${mb.id}`, Math.max(30_000, left() + 30_000));
        if (!lease) {
          entry.busy = true;
          entry.skipped = "another sender is using this mailbox right now — it keeps going on its own";
          return;
        }
      } catch (err) {
        // Can't tell whether another sender is using this mailbox: don't guess.
        entry.busy = true;
        entry.skipped = "couldn't check whether another sender is using this mailbox — trying again shortly";
        report.errors.push(`${mb.email}: send lease: ${(err as Error).message.slice(0, 160)}`);
        return;
      }

      // Counted while holding the mailbox, so two runners can't both use the last slots.
      const sentToday = (
        await db.select<{ id: string }>(
          "messages",
          // A sent email later marked "bounced" still used up a slot today.
          `mailbox_id=eq.${mb.id}&direction=eq.out&status=in.(sent,bounced)&sent_at=gte.${enc(startOfLocalDayIso(mb.timezone))}&select=id`,
        )
      ).length;
      // Hard account-wide limit: never more than GLOBAL_DAILY_SEND_LIMIT emails in any 24 hours, all mailboxes combined.
      const sentLast24h = (
        await db.select<{ id: string }>(
          "messages",
          `direction=eq.out&status=in.(sent,bounced)&sent_at=gte.${enc(new Date(Date.now() - 86_400_000).toISOString())}&select=id`,
        )
      ).length;
      const globalLeft = Math.max(0, GLOBAL_DAILY_SEND_LIMIT - sentLast24h);
      if (!globalLeft) {
        entry.skipped = `account limit reached (${sentLast24h}/${GLOBAL_DAILY_SEND_LIMIT} in the last 24 hours)`;
        return;
      }
      let remaining = Math.min(globalLeft, Math.max(0, Math.min(mb.daily_cap, GLOBAL_DAILY_SEND_LIMIT) - sentToday));
      entry.remaining_today = remaining;
      if (!remaining) {
        entry.skipped = `daily cap reached (${sentToday}/${mb.daily_cap}) — continues after midnight ${mb.timezone}`;
        return;
      }


      const nowIso = () => enc(new Date().toISOString());
      // Sequence "send all": who belongs to this action is fixed at its start.
      const frozenMs = force?.sequenceId && force.frozenAt ? Date.parse(force.frozenAt) : NaN;
      const frozenIso = Number.isFinite(frozenMs) ? enc(new Date(Math.min(frozenMs, Date.now())).toISOString()) : null;
      const frozenFilter = frozenIso ? `&created_at=lte.${frozenIso}` : "";
      const dueBy = () => frozenIso ?? nowIso();
      // Follow-ups wait while replies/opt-outs can't be read — also when chosen by hand.
      const followUpsOk = Date.now() - syncedAt < INBOX_FRESH_MS;
      if (!followUpsOk && !force?.enrollmentIds?.length) entry.followups_held = true;
      const onlyFirst = followUpsOk ? "" : "&current_step=eq.0";
      const base = `sequence_id=in.(${dueSeqIds.join(",")})&or=(mailbox_id.eq.${mb.id},mailbox_id.is.null)&select=*`;
      const limit = Math.min(remaining, maxPerRun);
      let due: Enrollment[];
      if (force?.enrollmentIds?.length) {
        const ids = force.enrollmentIds.filter((id) => VALID_ID.test(id)).slice(0, 200);
        due = ids.length
          ? await db.select<Enrollment>("enrollments", `status=in.(queued,active,paused,failed)&id=in.(${ids.join(",")})&${base}&order=next_send_at.asc&limit=${limit}`)
          : [];
      } else if (force?.sequenceId) {
        if (!seqsHere.some((s) => s.id === force.sequenceId)) {
          // Not part of this send at all: report nothing about who is left.
          entry.skipped = "this mailbox isn't used by that sequence";
          return;
        }
        // Everyone who hasn't had an email yet, plus follow-ups that are due.
        // Future follow-ups are NOT pulled forward, and someone whose last try
        // failed waits for their retry time instead of being hammered each round.
        // With a frozen start, people added (or falling due) later aren't part of it.
        const seqFilter = `status=in.(queued,active)&sequence_id=eq.${force.sequenceId}${frozenFilter}&or=(mailbox_id.eq.${mb.id},mailbox_id.is.null)&select=*`;
        // A paused or draft sequence sends first emails by hand; its follow-ups wait.
        const withFollowUps = followUpsOk && seqById.get(force.sequenceId)?.status === "active";
        const [fresh, firstDue, followUps] = await Promise.all([
          db.select<Enrollment>("enrollments", `${seqFilter}&current_step=eq.0&last_error=is.null&order=next_send_at.asc&limit=${limit}`),
          db.select<Enrollment>("enrollments", `${seqFilter}&current_step=eq.0&next_send_at=lte.${dueBy()}&order=next_send_at.asc&limit=${limit}`),
          withFollowUps
            ? db.select<Enrollment>("enrollments", `${seqFilter}&current_step=gt.0&next_send_at=lte.${dueBy()}&order=next_send_at.asc&limit=${limit}`)
            : Promise.resolve([] as Enrollment[]),
        ]);
        const seen = new Set<string>();
        due = [...followUps, ...firstDue, ...fresh].filter((e) => !seen.has(e.id) && !!seen.add(e.id)).slice(0, limit);
      } else {
        const dueNow = `status=in.(queued,active)&next_send_at=lte.${nowIso()}${onlyFirst}&select=*&order=next_send_at.asc&limit=${limit}`;
        const [mine, pool] = await Promise.all([
          ownSeqIds.length
            ? db.select<Enrollment>("enrollments", `${dueNow}&mailbox_id=eq.${mb.id}&sequence_id=in.(${ownSeqIds.join(",")})`)
            : Promise.resolve([] as Enrollment[]),
          dueSeqIds.length
            ? db.select<Enrollment>("enrollments", `${dueNow}&mailbox_id=is.null&sequence_id=in.(${dueSeqIds.join(",")})`)
            : Promise.resolve([] as Enrollment[]),
        ]);
        due = [...mine, ...pool]
          .sort((a, b) => Date.parse(a.next_send_at) - Date.parse(b.next_send_at))
          .slice(0, limit);
      }
      if (!due.length) {
        entry.skipped = force ? "nobody left to send to in this selection" : "nobody is due right now";
        entry.due_left = 0;
        return;
      }

      // Fail fast on a dead Google connection.
      if (!isGhl(mb)) {
        try {
          await accessTokenFor(env, db, mb.id);
        } catch (err) {
          const msg = (err as Error).message;
          if (isPermanentMailboxError(msg) || isMailboxAuthError(msg)) await markMailboxBroken(mb, msg, isPermanentMailboxError(msg));
          throw err;
        }
      }

      let lastSentAt: number | null = null;
      let followUpsHeld = false;
      if (!force) {
        const last = await db.one<{ sent_at: string }>(
          "messages",
          `mailbox_id=eq.${mb.id}&direction=eq.out&status=eq.sent&select=sent_at&order=sent_at.desc&limit=1`,
        );
        lastSentAt = last?.sent_at ? Date.parse(last.sent_at) : null;
      }
      let nextGapSec: number | null = null;
      // Earliest moment the next email may go (the gap picked after the last send, possibly in an earlier run).
      let notBefore = 0;
      if (!force) {
        const paceRow = await db
          .one<{ window_start: string }>("rate_limits", `key=eq.${enc(`pace:${mb.id}`)}&select=window_start`)
          .catch(() => null);
        notBefore = paceRow?.window_start ? Date.parse(paceRow.window_start) || 0 : 0;
      }

      for (const en of due) {
        if (remaining <= 0) {
          entry.skipped = "daily cap reached";
          break;
        }
        if (left() < SEND_RESERVE_MS) {
          entry.skipped = "time slot used up — the next run carries on";
          break;
        }
        const seq = seqById.get(en.sequence_id);
        if (!seq) continue;
        // Long runs: once the inbox read is older than 10 min, follow-ups wait
        // for the next run's sync (first emails carry on).
        if (en.current_step > 0 && (followUpsHeld || Date.now() - syncedAt >= INBOX_FRESH_MS)) {
          entry.followups_held = true;
          continue;
        }
        // A paused or draft sequence can send its first emails by hand, but its
        // follow-ups wait until it's active again (unless chosen one by one).
        if (en.current_step > 0 && seq.status !== "active" && !force?.enrollmentIds?.length) continue;
        let outcome: Awaited<ReturnType<typeof sendOne>>;
        try {
          outcome = await sendOne(mb, en, seq, entry, {
            // Each person's own sequence minimum; the random part of the gap
            // (picked after the previous send) is carried by notBefore.
            gapSec: force ? (nextGapSec ?? 0) : seq.gap_min_sec,
            lastSentAt,
            lease,
            notBefore: force ? 0 : notBefore,
            syncedAt: () => syncedAt,
            explicit: !!force?.enrollmentIds?.length,
            holdFollowUps: () => {
              followUpsHeld = true;
            },
          });
        } catch (err) {
          // Safety net only (sendOne handles its own errors). The person keeps
          // its claim and is tried again later; a database problem stops this
          // mailbox for this run instead of failing person after person.
          const msg = (err as Error).message;
          report.errors.push(`${mb.email}: ${en.id}: ${msg.slice(0, 200)}`);
          outcome = /^db /.test(msg) ? "stop" : "failed";
        }
        if (outcome === "sent") {
          entry.sent++;
          remaining--;
          lastSentAt = Date.now();
          nextGapSec = force
            ? pickGapSeconds(opts.forceGapSec?.[0] ?? 3, opts.forceGapSec?.[1] ?? 8)
            : pickGapSeconds(seq.gap_min_sec, seq.gap_max_sec);
          notBefore = lastSentAt + nextGapSec * 1000;
          // Remember the chosen gap for the next run too, so the random
          // rhythm (min–max) holds across runs instead of collapsing to "min".
          if (!force)
            await db
              .upsert("rate_limits", { key: `pace:${mb.id}`, window_start: new Date(notBefore).toISOString(), count: 0 }, "key")
              .catch(() => {});
        } else if (outcome === "unclear") {
          // It may have gone out: count it and keep the gap, then pause this
          // mailbox for a while instead of trying the next person straight away.
          remaining--;
          lastSentAt = Date.now();
          if (!force)
            await db
              .upsert("rate_limits", { key: `pace:${mb.id}`, window_start: new Date(Date.now() + 10 * 60_000).toISOString(), count: 0 }, "key")
              .catch(() => {});
          break;
        } else if (outcome === "stop") break;
        // "skipped"/"failed": nothing went out, move straight to the next person.
      }
      entry.remaining_today = remaining;
      if (force?.sequenceId) {
        const q = `status=in.(queued,active)&sequence_id=eq.${force.sequenceId}${frozenFilter}&select=id&limit=1000`;
        const lists = await Promise.all([
          db.select<{ id: string }>("enrollments", `${q}&current_step=eq.0&last_error=is.null`),
          db.select<{ id: string }>("enrollments", `${q}&current_step=eq.0&next_send_at=lte.${dueBy()}`),
          followUpsOk && seqById.get(force.sequenceId)?.status === "active"
            ? db.select<{ id: string }>("enrollments", `${q}&current_step=gt.0&next_send_at=lte.${dueBy()}`)
            : Promise.resolve([] as { id: string }[]),
        ]).catch(() => [] as { id: string }[][]);
        entry.due_left = remaining > 0 ? new Set(lists.flat().map((r) => r.id)).size : 0;
      }
    } catch (err) {
      const msg = (err as Error).message;
      report.errors.push(`${mb.email}: ${msg}`);
      await db
        .update("mailboxes", `id=eq.${mb.id}`, { last_error: msg.slice(0, 500) })
        .catch(() => {});
    } finally {
      await releaseLease(db, lease);
    }
  }

  async function markMailboxBroken(mb: Mailbox, msg: string, permanent = true) {
    await db
      .update("mailboxes", `id=eq.${mb.id}`, {
        ...(permanent ? { status: "error" } : {}),
        last_error: msg.slice(0, 500),
      })
      .catch(() => {});
  }

  /**
   * Claim one person, run every check, wait for the gap, send, record.
   * "stop" = the mailbox can't continue this run; "skipped"/"failed" = nothing went out.
   */
  type SendPace = Parameters<typeof sendOneInner>[4];
  async function sendOne(mb: Mailbox, en: Enrollment, seq: Sequence,
    entry: DispatchReport["mailboxes"][number], pace: SendPace,
  ): Promise<"sent" | "skipped" | "failed" | "stop" | "unclear"> {
    const held: { company?: Lease | null } = {};
    let outcome: string | undefined;
    try {
      outcome = await sendOneInner(mb, en, seq, entry, pace, held);
      return outcome as "sent" | "skipped" | "failed" | "stop" | "unclear";
    } finally {
      // A successful or ambiguous send retains the short reservation while its
      // durable history is recorded; all other exits release it, including throws.
      if (held.company && outcome !== "sent" && outcome !== "unclear") await releaseLease(db, held.company);
    }
  }

  async function sendOneInner(
    mb: Mailbox,
    en: Enrollment,
    seq: Sequence,
    entry: DispatchReport["mailboxes"][number],
    pace: {
      gapSec: number;
      lastSentAt: number | null;
      lease: Lease | null;
      notBefore: number;
      /** When the inbox was last read completely. */
      syncedAt: () => number;
      /** Chosen by hand ("Send now" on these people). */
      explicit: boolean;
      /** Stop picking follow-ups for the rest of this run. */
      holdFollowUps: () => void;
    },
    held: { company?: Lease | null },
  ): Promise<"sent" | "skipped" | "failed" | "stop" | "unclear"> {
    const lease = pace.lease;
    // ATOMIC CLAIM: only succeeds if the row is still exactly as we read it
    // (same step, same scheduled time, same status), so two runners — or two
    // mailboxes sharing an unassigned person — never both send, and a person
    // paused or answered in the meantime is left alone.
    // 20–21 min ahead, with random milliseconds so two runners never pick the same value.
    const parkedAt = new Date(Date.now() + 20 * 60_000 + Math.floor(Math.random() * 60_000)).toISOString();
    const claimedStatus = en.status;
    const claimed = await db.update<{ id: string }>(
      "enrollments",
      `id=eq.${en.id}&current_step=eq.${en.current_step}&next_send_at=${en.next_send_at ? `eq.${enc(en.next_send_at)}` : "is.null"}&status=eq.${enc(claimedStatus)}&select=id`,
      { mailbox_id: en.mailbox_id || mb.id, next_send_at: parkedAt },
    );
    if (!claimed.length) return "skipped";
    en.mailbox_id = en.mailbox_id || mb.id;
    /** Still exactly as we claimed (or marked) it — nobody paused, removed or answered it since. */
    const oursAt = (at: string) =>
      `id=eq.${en.id}&current_step=eq.${en.current_step}&next_send_at=eq.${enc(at)}&status=eq.${enc(claimedStatus)}`;
    let holdAt = parkedAt;
    let ours = oursAt(holdAt);
    const originalNote = (en as { last_error?: string | null }).last_error ?? null;
    /** Put the person back exactly as due as before (nothing was sent). */
    const unpark = (extra: Record<string, unknown> = {}) =>
      db
        .update("enrollments", ours, { next_send_at: en.next_send_at || new Date().toISOString(), ...extra })
        .catch(() => {});

    let steps: Step[] = [];
    let step: Step | undefined;
    let lead: Lead | null = null;
    let rendered: ReturnType<typeof renderStep> | null = null;
    let unsubscribeUrl = "";
    let threadGone = false;
    const variant = en.variant === "B" ? "B" : "A";
    try {
      steps = await stepsOf(seq.id);
      step = steps[en.current_step];
      if (!step) {
        await db.update("enrollments", ours, { status: "completed", completed_at: new Date().toISOString() }).catch(() => {});
        return "skipped";
      }

      // A previous run stopped in the middle of sending this step.
      if ((en as { last_error?: string | null }).last_error?.startsWith(SENDING_MARK)) {
        const record = await db.one<{ gmail_thread_id: string | null; rfc_message_id: string | null }>(
          "messages",
          `enrollment_id=eq.${en.id}&direction=eq.out&status=eq.sent&step_position=eq.${step.position}&select=gmail_thread_id,rfc_message_id`,
        );
        if (record) {
          await advance(en, mb, seq, steps, claimedStatus, { threadId: record.gmail_thread_id || undefined, messageId: record.rfc_message_id || undefined });
          return "skipped";
        }
        // We can't tell whether the provider sent it. Never risk a duplicate:
        // hold the person for a human decision.
        const note = `Possibly sent already — the server stopped while sending email ${en.current_step + 1}. Check your Sent folder; press ▶ to send it anyway.`;
        await db
          .update("enrollments", ours, { status: "paused", last_error: note })
          // (an old double enrolment can refuse "paused"; "failed" is never refused)
          .catch(() => db.update("enrollments", ours, { status: "failed", last_error: note }))
          .catch(() => {});
        return "skipped";
      }

      lead = await db.one<Lead>("leads", `id=eq.${en.lead_id}&select=*`);
      if (!lead?.email) {
        await db.update("enrollments", ours, { status: "skipped", last_error: "lead has no email" }).catch(() => {});
        return "skipped";
      }
      const isSuppressed = async (l: Lead) =>
        !!(await db.one(
          "suppressions",
          `or=(email.eq.${enc(pgQuote((l.email || "").toLowerCase()))}${isCompanyDomain(l.domain) ? `,domain.eq.${enc(pgQuote(l.domain))}` : ""})&select=id`,
        ));
      if (await isSuppressed(lead)) {
        await db.update("enrollments", ours, { status: "unsubscribed", last_error: "on suppression list" }).catch(() => {});
        return "skipped";
      }
      // Never email someone twice from two sequences.
      if (en.current_step === 0) {
        const other = await db.one<{ id: string }>(
          "enrollments",
          `lead_id=eq.${lead.id}&id=neq.${en.id}&status=in.(queued,active,paused)&current_step=gt.0&select=id`,
        );
        if (other) {
          await db.update("enrollments", ours, { status: "skipped", last_error: "already being emailed in another sequence" }).catch(() => {});
          entry.duplicates_held = (entry.duplicates_held ?? 0) + 1;
          return "skipped";
        }
        if (!pace.explicit) {
          const domain = cleanDomain(lead.domain);
          if (isCompanyDomain(domain)) {
            // Acquire BEFORE reading company history, so a parallel mailbox must
            // wait until the winning sender records its message. Failure is closed.
            const company = await acquireLease(db, `company:${domain}`, 15 * 60_000);
            if (!company) {
              await unpark({ next_send_at: new Date(Date.now() + 10 * 60_000).toISOString() });
              return "skipped";
            }
            held.company = company;
          }
          const contacted = await companyAlreadyContacted(db, lead, { excludeEnrollmentId: en.id });
          if (contacted) {
            await db.update("enrollments", ours, {
              status: "skipped",
              last_error: `${contacted.reason} — skipped so the company isn't emailed again (Send now on this person to send anyway)`,
            });
            entry.duplicates_held = (entry.duplicates_held ?? 0) + 1;
            return "skipped";
          }
        }
      }
      // Automatic bounce check BEFORE the first send (Reoon if configured, else MX).
      const check = await preSendCheck(env, db, { ...lead, email: lead.email });
      if (!check.ok) {
        await applyHardBounce(db, {
          email: lead.email,
          lead,
          enrollmentId: en.id,
          reason: "verify_invalid",
          note: `pre-send check: ${check.reason}`,
        });
        entry.bounce_blocked = (entry.bounce_blocked ?? 0) + 1;
        return "skipped";
      }

      // Wait out the sequence gap inside this run when it fits; otherwise hand
      // the person back and let the next run send them.
      const wait = Math.max(gapWaitMs(pace.lastSentAt, pace.gapSec), pace.notBefore - Date.now(), 0);
      if (!fitsDispatchBudget(runStart, budget, wait + SEND_RESERVE_MS)) {
        await unpark();
        entry.next_send_in_sec = Math.ceil(wait / 1000);
        entry.skipped = wait > 0 ? `next email in ~${Math.ceil(wait / 1000)} s (sequence gap)` : "time slot used up — the next run carries on";
        return "stop";
      }
      if (wait > 0) {
        await sleep(wait);
        // A "stop" reply can land while we wait: look again.
        if (await isSuppressed(lead)) {
          await db.update("enrollments", ours, { status: "unsubscribed", last_error: "on suppression list" }).catch(() => {});
          return "skipped";
        }
      }
      if (lease && !(await renewLease(db, lease, Math.max(30_000, left() + 30_000)).catch(() => false))) {
        await unpark();
        entry.busy = true;
        entry.skipped = "another sender took over this mailbox";
        return "stop";
      }

      if (en.current_step > 0 && !en.thread_id) {
        await unpark({ last_error: "Follow-up held: the original conversation is missing." });
        entry.followups_held = true;
        return "skipped";
      }
      // Follow-ups: look in the conversation itself right before sending, so a
      // reply or bounce the inbox read hasn't picked up (yet) still stops it.
      if (en.current_step > 0 && en.thread_id) {
        let seen: ThreadState;
        try {
          seen = await withTimeout(
            threadState(env, db, mb, en.thread_id, Date.parse(String((en as { created_at?: string }).created_at || "")) || 0, lead.email),
            20_000,
            "reply check",
          );
        } catch (err) {
          // Couldn't look (provider down, rate limit): this follow-up keeps its
          // place, and the other follow-ups wait for the next run too — nobody is
          // pushed back one by one during an outage. First emails carry on.
          await unpark();
          pace.holdFollowUps();
          entry.followups_held = true;
          report.errors.push(`${mb.email}: couldn't check a conversation for replies (${(err as Error).message.slice(0, 120)}) — follow-ups wait`);
          return "skipped";
        }
        if (seen.bounced) {
          await applyHardBounce(db, {
            email: lead.email,
            lead,
            enrollmentId: en.id,
            reason: "bounce",
            note: `bounced (found before the follow-up): ${seen.bounced}`.slice(0, 200),
          });
          entry.bounce_blocked = (entry.bounce_blocked ?? 0) + 1;
          return "skipped";
        }
        if (seen.replied) {
          await applyReply(db, {
            enrollment: en,
            lead,
            stop: seen.replied.stop,
            at: seen.replied.at,
            note: seen.replied.text.slice(0, 200),
          });
          // A sequence set to keep going after replies ("stop on reply" off) goes on.
          if (seen.replied.stop || seq.stop_on_reply !== false) {
            entry.replies_caught = (entry.replies_caught ?? 0) + 1;
            return "skipped";
          }
        }
        if (seen.missing) {
          if (isGhl(mb) && !pace.explicit) {
            // The conversation was deleted: there's no way to see a reply.
            await db
              .update("enrollments", ours, {
                status: "failed",
                last_error: "Can't check this conversation for a reply — it was deleted in GoHighLevel. Press Send on this person to send the follow-up anyway.",
              })
              .catch(() => {});
            return "failed";
          }
          // Gmail: their mail was searched directly; send in a new thread.
          threadGone = true;
        }
      }

      unsubscribeUrl = `${unsubBase}/api/unsub?t=${en.unsub_token}`;
      const pickSubject = (st: Step) => (variant === "B" && st.subject_b?.trim() ? st.subject_b : st.subject);
      rendered = renderStep({
        step: { ...step, subject: pickSubject(step) },
        lead,
        mailbox: mb,
        settings,
        unsubscribeUrl,
        isFollowUp: en.current_step > 0,
        firstSubject: steps[0] ? pickSubject(steps[0]) : "",
      });
    } catch (err) {
      // Nothing was sent. A database hiccup stops this mailbox for this run
      // (the person stays due); anything else about THIS person (a template, a
      // broken lead row) parks only them for an hour with the reason.
      const msg = (err as Error).message;
      // A database outage stops the mailbox; a request the database REFUSED
      // (something odd in this person's data) only parks this person.
      if (/^db (select|update|insert|upsert|rpc)/.test(msg) && !isDbRefusal(msg)) {
        await unpark();
        report.errors.push(`${mb.email}: ${msg.slice(0, 200)}`);
        return "stop";
      }
      await db
        .update("enrollments", ours, {
          next_send_at: new Date(Date.now() + 3600_000).toISOString(),
          last_error: `Could not prepare this email: ${msg.slice(0, 300)}`,
        })
        .catch(() => {});
      report.errors.push(`${mb.email}: ${en.id}: ${msg.slice(0, 200)}`);
      return "failed";
    }

    // A follow-up only goes out while the inbox read is still fresh (long runs).
    if (en.current_step > 0 && Date.now() - pace.syncedAt() >= INBOX_FRESH_MS) {
      await unpark();
      entry.followups_held = true;
      return "skipped";
    }

    // Mark the attempt — and make sure, one last time, that the person is still
    // exactly as we claimed them. No mark, no send: a run that dies mid-send can
    // then never lead to a blind resend.
    // The mark also moves next_send_at to a new value: from here on no other
    // runner's claim (based on an earlier read of this row) can succeed.
    const markedAt = new Date(Date.parse(parkedAt) + 1 + Math.floor(Math.random() * 59_000)).toISOString();
    let marked: { id: string }[] = [];
    try {
      marked = await db.update<{ id: string }>("enrollments", `${ours}&select=id`, {
        last_error: `${SENDING_MARK}${en.current_step + 1} at ${new Date().toISOString()}`,
        next_send_at: markedAt,
      });
    } catch (err) {
      // The mark may have been saved even though the answer got lost: put the
      // person back either way, so they aren't later held as "possibly sent".
      const restore = { next_send_at: en.next_send_at || new Date().toISOString(), last_error: originalNote };
      await db.update("enrollments", oursAt(parkedAt), restore).catch(() => {});
      await db.update("enrollments", oursAt(markedAt), restore).catch(() => {});
      report.errors.push(`${mb.email}: could not mark ${en.id} before sending: ${(err as Error).message.slice(0, 160)}`);
      return "stop";
    }
    if (!marked.length) return "skipped"; // paused, removed or answered meanwhile
    holdAt = markedAt;
    ours = oursAt(holdAt);
    if (!step || !lead?.email || !rendered) return "skipped"; // (unreachable: set above)

    let sent: Awaited<ReturnType<typeof sendVia>>;
    try {
      sent = await sendVia(env, db, mb, {
        deadline: runStart + budget,
        to: { name: lead.contact_name, email: lead.email },
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        threadId: en.current_step > 0 && !threadGone ? en.thread_id || undefined : undefined,
        inReplyTo: en.current_step > 0 ? en.first_message_id || undefined : undefined,
        unsubscribeUrl,
        company: lead.company,
        phone: lead.phone,
      });
    } catch (err) {
      const msg = (err as Error).message;
      const notSent = certainlyNotSent(err);
      await db
        .insert("messages", {
          enrollment_id: en.id,
          lead_id: lead.id,
          mailbox_id: mb.id,
          direction: "out",
          step_position: step.position,
          subject: rendered.subject,
          kind: "email",
          status: "failed",
          error: (notSent ? msg : `no clear answer — may have been sent: ${msg}`).slice(0, 500),
        })
        .catch(() => {});
      if (isInvalidRecipientError(msg)) {
        // The provider refused the ADDRESS → dead: blacklist it, stop every sequence it's in.
        await applyHardBounce(db, {
          email: lead.email,
          lead,
          enrollmentId: en.id,
          reason: "bounce",
          note: `rejected by ${isGhl(mb) ? "GHL" : "Gmail"}: ${msg.slice(0, 150)}`,
        });
        return "failed";
      }
      const backOff = (minutes: number) =>
        force
          ? Promise.resolve()
          : db
              .upsert("rate_limits", { key: `pace:${mb.id}`, window_start: new Date(Date.now() + minutes * 60_000).toISOString(), count: 0 }, "key")
              .then(() => undefined)
              .catch(() => undefined);
      if (!notSent) {
        // A timeout, lost connection or server error AT the send call: the
        // provider may have sent it anyway. Never risk a duplicate — hold the
        // person for a human decision. Only while the row is still exactly as we
        // marked it: a reply or pause that landed meanwhile wins, and otherwise the
        // "sending" mark stays as the guard. The loop counts it and pauses the mailbox.
        const note = `Possibly sent already — the send to ${isGhl(mb) ? "GoHighLevel" : "Gmail"} didn't answer clearly (${msg.slice(0, 120)}). Check your Sent folder; press ▶ to send it anyway.`;
        await db
          .update("enrollments", ours, { status: "paused", last_error: note })
          .catch(() => db.update("enrollments", ours, { status: "failed", last_error: note }))
          .catch(() => {});
        entry.skipped = "the email provider didn't answer clearly — this mailbox pauses ~10 minutes";
        report.errors.push(`${mb.email}: unclear send result for ${lead.email}: ${msg.slice(0, 160)}`);
        return "unclear";
      }
      if (/^db /.test(msg)) {
        // The database failed before the send (reading the connection): nothing
        // went out. Put the person back as they were and stop this mailbox for now.
        await unpark({ last_error: originalNote });
        report.errors.push(`${mb.email}: ${msg.slice(0, 200)}`);
        return "stop";
      }
      if (isRateLimited(msg)) {
        // "Slow down" for the whole mailbox: the person keeps their place.
        await unpark({ last_error: originalNote });
        await backOff(10);
        entry.skipped = "the email provider asked to slow down — sending resumes in about 10 minutes";
        report.errors.push(`${mb.email}: ${msg.slice(0, 200)}`);
        return "stop";
      }
      if (isMailboxAuthError(msg)) {
        // The connection itself: the person keeps their place, the mailbox stops.
        await unpark({ last_error: originalNote });
        await markMailboxBroken(mb, msg, isPermanentMailboxError(msg));
        report.errors.push(`${mb.email}: ${msg.slice(0, 200)}`);
        return "stop";
      }
      if (isRecipientRefusal(msg)) {
        // Clearly refused for THIS person (contact data, 4xx): retry them in an hour.
        await db
          .update("enrollments", ours, {
            next_send_at: new Date(Date.now() + 3600_000).toISOString(),
            last_error: msg.slice(0, 500),
          })
          .catch(() => {});
        return "failed";
      }
      // A temporary problem before the send call (server error, lost connection,
      // time-out): this person tries again in 10 minutes — so one odd contact can
      // never block the queue — and the mailbox pauses briefly instead of
      // pushing everyone else back one by one.
      await db
        .update("enrollments", ours, {
          next_send_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          last_error: `temporary problem before sending (${msg.slice(0, 200)}) — trying again in 10 min`,
        })
        .catch(() => {});
      await backOff(2);
      entry.skipped = "temporary problem reaching the email provider — trying again in a few minutes";
      report.errors.push(`${mb.email}: ${msg.slice(0, 200)}`);
      return "stop";
    }

    // The email is out. From here on nothing may cause a resend.
    let logged = true;
    await db
      .insert("messages", {
        enrollment_id: en.id,
        lead_id: lead.id,
        mailbox_id: mb.id,
        direction: "out",
        step_position: step.position,
        gmail_message_id: sent.id,
        gmail_thread_id: sent.threadId,
        rfc_message_id: sent.rfcMessageId,
        subject: rendered.subject,
        snippet: rendered.text.slice(0, 160),
        kind: "email",
        status: "sent",
        variant,
      })
      .catch((err) => { logged = false; report.errors.push(`${mb.email}: sent email could not log delivery: ${(err as Error).message.slice(0, 160)}`); });
    await advance(en, mb, seq, steps, claimedStatus, { threadId: sent.threadId, messageId: sent.rfcMessageId });
    if (!logged) await db.update("enrollments", `id=eq.${en.id}`, { last_error: `Sent but not logged at ${new Date().toISOString()} — check Sent folder before manual retry.` }).catch(() => {});
    return "sent";
  }

  /**
   * Record a sent step. Only a row still in the status we claimed gets the new
   * status and next date; if it was answered/paused meanwhile, just the step
   * itself is recorded (so it can never be sent again). A legacy overlap (lead
   * in two running sequences) refuses the status change — then advance without it.
   */
  async function advance(
    en: Enrollment,
    mb: Mailbox,
    seq: Sequence,
    steps: Step[],
    claimedStatus: string,
    sent: { threadId?: string; messageId?: string },
  ) {
    const nextStep = steps[en.current_step + 1];
    let nextAt: string | null = null;
    if (nextStep) {
      const delayMs = Math.max(1, nextStep.delay_days) * 86_400_000 + rand(0, 3 * 3600_000);
      nextAt = (seq.send_anytime ? new Date(Date.now() + delayMs) : nextWindowTime(mb, delayMs)).toISOString();
    }
    const core: Record<string, unknown> = {
      current_step: en.current_step + 1,
      thread_id: en.thread_id || sent.threadId || null,
      first_message_id: en.first_message_id || sent.messageId || null,
      last_error: null,
    };
    const schedule: Record<string, unknown> = nextAt ? { next_send_at: nextAt } : { completed_at: new Date().toISOString() };
    const full = { ...core, ...schedule, status: nextStep ? "active" : "completed", mailbox_id: mb.id };
    try {
      const rows = await db.update<{ id: string }>(
        "enrollments",
        `id=eq.${en.id}&current_step=eq.${en.current_step}&status=eq.${enc(claimedStatus)}&select=id`,
        full,
      );
      if (rows.length) return;
      // Answered, paused or removed while sending: keep their status, record the step.
      await db.update("enrollments", `id=eq.${en.id}&current_step=eq.${en.current_step}`, core);
    } catch (err) {
      try {
        await db.update("enrollments", `id=eq.${en.id}&current_step=eq.${en.current_step}`, { ...core, ...schedule });
      } catch (err2) {
        report.errors.push(`${mb.email}: could not record step for ${en.id}: ${(err2 as Error).message.slice(0, 160)} (first try: ${(err as Error).message.slice(0, 80)})`);
      }
    }
  }

  const work = mailboxes.map((mb) => {
    const entry: DispatchReport["mailboxes"][number] = { email: mb.email, sent: 0, remaining_today: 0 };
    report.mailboxes.push(entry);
    return runMailbox(mb, entry);
  });
  await Promise.all(work);
  return report;
}

/** Look at the mailbox inbox for replies / bounces to our threads. */
async function syncMailbox(
  env: Env,
  db: Db,
  mb: Mailbox,
  /** Stop between messages after this moment (the rest is read next time). */
  deadline?: number,
): Promise<{ replies: number; bounces: number; stops: number; partial?: boolean; note?: string }> {
  const out: { replies: number; bounces: number; stops: number; partial?: boolean; note?: string } = { replies: 0, bounces: 0, stops: 0 };
  if (isGhl(mb)) return syncGhlMailbox(env, db, mb, deadline);
  const token = await accessTokenFor(env, db, mb.id);
  // Read back to the last complete read (with an hour of overlap), at most 14
  // days — so nothing is skipped after a quiet spell. Never read before: 3 days.
  const lastOk = mb.last_sync_at ? Date.parse(mb.last_sync_at) : 0;
  const listedAt = Date.now();
  const sinceMs = lastOk ? Math.max(listedAt - 14 * 86400e3, lastOk - 3600e3) : listedAt - 3 * 86400e3;
  const sec = (ms: number) => Math.floor(ms / 1000);
  let windowEnd = listedAt;
  const within = () => `after:${sec(sinceMs)}${windowEnd < listedAt ? ` before:${sec(windowEnd)}` : ""}`;
  let inbox = await gmailListAll(token, `in:inbox ${within()}`, 2000);
  // Too much since the last read (a long gap in a busy inbox): read the oldest
  // part completely now and carry on from there next time.
  while (inbox.more && windowEnd - sinceMs > 2 * 3600e3) {
    windowEnd = sinceMs + Math.floor((windowEnd - sinceMs) / 2);
    inbox = await gmailListAll(token, `in:inbox ${within()}`, 2000);
  }
  const behind = windowEnd < listedAt || inbox.more;
  if (inbox.more) out.note = "very busy inbox — the newest 2000 messages of a two-hour slice were checked";

  // Replies that started a new conversation (the person changed the subject):
  // look for mail FROM the people this mailbox is emailing right now.
  const leadByEmail = new Map<string, string>();
  const running = await db.select<{ lead_id: string }>(
    "enrollments",
    `mailbox_id=eq.${mb.id}&status=in.(queued,active,paused)&current_step=gt.0&select=lead_id&limit=2000`,
  );
  const runningLeadIds = [...new Set(running.map((r) => r.lead_id))];
  for (let i = 0; i < runningLeadIds.length; i += 100) {
    const rows = await db.select<{ id: string; email: string | null }>(
      "leads",
      `id=in.(${runningLeadIds.slice(i, i + 100).join(",")})&select=id,email`,
    );
    for (const r of rows) {
      const e = (r.email || "").toLowerCase().trim();
      if (/^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e)) leadByEmail.set(e, r.id);
    }
  }
  const senders = [...leadByEmail.keys()];
  const fromLeads: { id: string; threadId: string }[] = [];
  const chunks: string[][] = [];
  for (let i = 0; i < senders.length; i += 40) chunks.push(senders.slice(i, i + 40));
  // A few searches side by side, so a big mailbox stays well inside the time slot.
  for (let i = 0; i < chunks.length; i += 4) {
    const found = await Promise.all(
      chunks.slice(i, i + 4).map((c) => gmailListAll(token, `in:inbox ${within()} {${c.map((e) => `from:${e}`).join(" ")}}`, 200)),
    );
    for (const f of found) fromLeads.push(...f.items);
  }
  const bounceHits = await gmailListAll(token, `in:inbox ${within()} ${GMAIL_BOUNCE_QUERY}`, 500);

  // Only these are opened: messages in one of OUR conversations, mail from the
  // people we're emailing, and anything that looks like a bounce.
  const ourThreads = new Set<string>();
  const threadIds = [...new Set(inbox.items.map((m) => m.threadId))];
  for (let i = 0; i < threadIds.length; i += 100) {
    const rows = await db.select<{ thread_id: string }>(
      "enrollments",
      `thread_id=in.(${threadIds.slice(i, i + 100).map((t) => `"${t}"`).join(",")})&select=thread_id`,
    );
    for (const r of rows) ourThreads.add(r.thread_id);
  }
  const bounceIds = new Set(bounceHits.items.map((m) => m.id));
  const fromLeadIds = new Set(fromLeads.map((m) => m.id));
  const wanted = new Map<string, { id: string; threadId: string }>();
  for (const m of [...inbox.items, ...bounceHits.items, ...fromLeads])
    if (ourThreads.has(m.threadId) || bounceIds.has(m.id) || fromLeadIds.has(m.id)) wanted.set(m.id, m);
  const ids = [...wanted.keys()];
  // Skip ones we've already recorded.
  const known = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await db.select<{ gmail_message_id: string }>(
      "messages",
      `gmail_message_id=in.(${ids.slice(i, i + 100).map((x) => `"${x}"`).join(",")})&select=gmail_message_id`,
    );
    for (const r of rows) known.add(r.gmail_message_id);
  }
  for (const id of ids) {
    if (known.has(id)) continue;
    if (deadline && Date.now() > deadline) {
      out.partial = true; // not "synced": follow-ups keep waiting until a full pass
      break;
    }
    const m = await gmailGetHeaders(token, id);
    if (!m) {
      // Couldn't read it (rate limit, Gmail hiccup): this pass isn't complete,
      // so follow-ups keep waiting until it has been read.
      out.partial = true;
      continue;
    }

    // Bounce: find the failed recipient and suppress.
    if (isBounce(m)) {
      const failed = (
        m.failedRecipients ||
        m.snippet.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ||
        ""
      )
        .toLowerCase()
        .trim();
      const en = m.threadId ? await enrollmentForThread<Enrollment>(db, `thread_id=eq.${enc(m.threadId)}`) : null;
      const lead = en
        ? await db.one<Lead>("leads", `id=eq.${en.lead_id}&select=*`)
        : failed
          ? await db.one<Lead>("leads", `email=ilike.${enc(failed)}&select=*`)
          : null;
      const email = (lead?.email || failed || "").toLowerCase();
      const kind = classifyBounce(m.subject, m.snippet);
      const record = () =>
        db.insert("messages", {
          enrollment_id: en?.id ?? null,
          lead_id: lead?.id ?? null,
          mailbox_id: mb.id,
          direction: "in",
          gmail_message_id: m.id,
          gmail_thread_id: m.threadId,
          subject: m.subject,
          snippet: `${kind === "hard" ? "HARD" : "soft"} bounce: ${m.snippet}`.slice(0, 300),
          kind: "bounce",
          status: "received",
          sent_at: new Date(m.internalDate || Date.now()).toISOString(),
        });
      if (kind === "hard") {
        // Apply first (a failed write throws, so the bounce is read again next
        // time); applying a hard bounce twice is harmless.
        await applyHardBounce(db, {
          email,
          lead,
          enrollmentId: en?.id ?? null,
          reason: "bounce",
          note: `${m.subject} — ${m.snippet}`.slice(0, 200),
          strict: true,
        });
        await record().catch(() => {});
      } else {
        // Record first: the same soft bounce read twice would count as a second one.
        await record();
        const r = await applySoftBounce(db, en, m.snippet);
        if (r === "gave_up")
          await applyHardBounce(db, {
            email,
            lead,
            enrollmentId: en?.id ?? null,
            reason: "bounce",
            note: `soft bounce twice: ${m.snippet}`.slice(0, 200),
            strict: true,
          });
      }
      out.bounces++;
      continue;
    }

    // A reply: in one of our threads, or a new conversation from someone we're emailing.
    let en = ourThreads.has(m.threadId) ? await enrollmentForThread<Enrollment>(db, `thread_id=eq.${enc(m.threadId)}`) : null;
    if (!en) {
      const sender = (/<([^>]+)>/.exec(m.from)?.[1] || m.from).toLowerCase().trim();
      const leadId = leadByEmail.get(sender);
      if (leadId) en = await enrollmentForThread<Enrollment>(db, `lead_id=eq.${leadId}&mailbox_id=eq.${mb.id}`);
    }
    if (!en) continue; // a bounce-like search hit that isn't one
    const auto = isAutoReply(m);
    const lead = await db.one<Lead>("leads", `id=eq.${en.lead_id}&select=*`);
    const full = auto ? null : await gmailGetFull(token, m.id);
    const bodyText = full?.text || m.snippet;
    // Claude reads the reply: what do they want, and what would we answer?
    let intent = auto ? "auto" : "unknown";
    let draft = "";
    if (!auto) {
      const stepRows = await db.select<Step>(
        "sequence_steps",
        `sequence_id=eq.${en.sequence_id}&select=*&order=position.asc`,
      );
      const settings = await db.one<OutreachSettings>(
        "outreach_settings",
        "id=eq.singleton&select=*",
      );
      const ai = await classifyReply(env, {
        replyText: bodyText,
        lead,
        ourFirstEmail: stepRows[0]?.body || "",
        senderName: mb.display_name,
        company: settings?.company_name || "Inspirova Marketing",
        signature: mb.signature,
        instructions: settings?.ai_instructions || "",
      });
      if (ai) {
        intent = ai.intent;
        draft = ai.draft;
      }
    }
    // Act on the reply FIRST (stop the sequence, honour an opt-out), and only
    // then record the message as handled — if the run ends in between, the
    // reply is simply processed again next time instead of being lost.
    if (!auto) {
      const stop = intent === "not_interested" || wantsToStop(m.subject) || wantsToStop(bodyText);
      // Every running sequence for this person stops, not only this thread's.
      await applyReply(db, {
        enrollment: en,
        lead,
        stop,
        at: new Date(m.internalDate || Date.now()).toISOString(),
        note: m.snippet.slice(0, 200),
      });
      if (stop) out.stops++;
    }
    let logged = true;
    await db
      .insert("messages", {
        enrollment_id: en.id,
        lead_id: en.lead_id,
        mailbox_id: mb.id,
        direction: "in",
        gmail_message_id: m.id,
        gmail_thread_id: m.threadId,
        rfc_message_id: full?.messageIdHeader || null,
        from_header: m.from,
        subject: m.subject,
        snippet: m.snippet.slice(0, 300),
        body_text: bodyText,
        intent,
        draft_reply: draft || null,
        kind: auto ? "auto_reply" : "reply",
        status: "received",
        sent_at: new Date(m.internalDate || Date.now()).toISOString(),
      })
      .catch(() => {});
    if (auto) continue; // out-of-office: keep the sequence going
    out.replies++;
  }
  // Cut short (time slot, unreadable message): nothing is marked as read, the
  // next pass redoes this window (what was recorded is skipped).
  if (out.partial) return out;
  // Everything up to windowEnd is read. Still catching up after a long gap? Then
  // follow-ups keep waiting this run, but the progress is kept.
  await db.update("mailboxes", `id=eq.${mb.id}`, {
    last_sync_at: new Date(windowEnd).toISOString(),
    last_error: null,
  });
  if (behind) out.partial = true;
  return out;
}

/** Permanent account-wide sending limit (all mailboxes combined, rolling 24 hours). */
export const GLOBAL_DAILY_SEND_LIMIT = 40;
