/**
 * Sequencer — runs on a Cloudflare Cron Trigger (every 10 min) and on demand
 * from /api/cron/dispatch.
 *
 * Each run:
 *   1. For every active mailbox inside its send window: work out how many
 *      emails it may still send today (daily cap − sent today).
 *   2. Pull that many due enrollments (next_send_at ≤ now), skip anything on
 *      the suppression list or without a usable email, render the step, send
 *      it (follow-ups as replies in the same Gmail thread), log it, and
 *      schedule the next step with a random gap so the pattern looks human.
 *   3. Sync each mailbox's inbox: replies stop the sequence, bounces suppress
 *      the address, "unsubscribe"-style replies suppress too.
 *
 * Idempotent and conservative: if anything about a mailbox errors, that
 * mailbox is skipped this run and the error is stored on the row.
 */

import { Db, enc } from "./db";
import { accessTokenFor } from "./google-oauth";
import { sendVia, isGhl } from "./channel";
import { syncGhlMailbox } from "./ghl-sync";
import {
  gmailSend,
  gmailListRecent,
  gmailGetHeaders,
  newMessageId,
  isBounce,
  isAutoReply,
  wantsToStop,
} from "./gmail";
import { renderStep } from "./templates";
import { gmailGetFull } from "./gmail";
import { runDueSavedSearches } from "./saved-searches";
import { classifyReply } from "./reply-ai";
import { preSendCheck, classifyBounce, applyHardBounce, applySoftBounce } from "./bounce";

type Env = Record<string, string | undefined>;

export interface Mailbox {
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
function localParts(tz: string, d = new Date()): { hour: number; day: number; ymd: string } {
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
function startOfLocalDayIso(tz: string): string {
  const now = new Date();
  const { ymd } = localParts(tz, now);
  // Find the UTC instant where the local date flips to `ymd` by stepping back hour by hour.
  let t = now.getTime();
  for (let i = 0; i < 48; i++) {
    const probe = new Date(t - 3600_000);
    if (localParts(tz, probe).ymd !== ymd) break;
    t -= 3600_000;
  }
  // t is within the first hour of the local day; snap down to the hour.
  const snapped = new Date(t);
  snapped.setUTCMinutes(0, 0, 0);
  return snapped.toISOString();
}

function inWindow(mb: Mailbox): boolean {
  const { hour, day } = localParts(mb.timezone);
  return mb.send_days.includes(day) && hour >= mb.window_start && hour < mb.window_end;
}

/** Next instant that's inside the mailbox window, at least `afterMs` from now, plus jitter. */
function nextWindowTime(mb: Mailbox, afterMs: number): Date {
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
  mailboxes: {
    email: string;
    sent: number;
    remaining_today: number;
    skipped?: string;
    /** Addresses the pre-send bounce check refused this run. */
    bounce_blocked?: number;
    synced?: { replies: number; bounces: number; stops: number };
  }[];
  errors: string[];
}

export interface ForceSend {
  /** Send these enrollments right now, ignoring their scheduled time and the mailbox hours. */
  enrollmentIds?: string[];
  /** …or everyone waiting in this sequence. */
  sequenceId?: string;
}

export async function runDispatch(
  env: Env,
  opts: { maxPerRun?: number; origin?: string; syncOnly?: boolean; force?: ForceSend } = {},
): Promise<DispatchReport> {
  const db = new Db(env);
  const report: DispatchReport = { ran_at: new Date().toISOString(), mailboxes: [], errors: [] };
  const force = opts.force;
  // A forced run is a person waiting at the screen: short gaps, small batch.
  const maxPerRun = opts.maxPerRun ?? (force ? 20 : 40);

  const [mailboxes, settingsRow] = await Promise.all([
    db.select<Mailbox>("mailboxes", "status=eq.active&select=*"),
    db.one<OutreachSettings>("outreach_settings", "id=eq.singleton&select=*"),
  ]);
  const settings: OutreachSettings = settingsRow ?? {
    company_name: "Inspirova Marketing",
    postal_address: "",
    website: "",
    eu_notice: "",
    us_notice: "",
  };
  // Forced sends also work from paused/draft sequences (the follow-ups still
  // wait for the sequence to be active).
  const activeSequences = await db.select<Sequence>(
    "sequences",
    force ? "status=neq.archived&select=*" : "status=eq.active&select=*",
  );
  const seqById = new Map(activeSequences.map((s) => [s.id, s]));

  // Scheduled saved searches (find + enrich + enroll new businesses) run first.
  if (!opts.syncOnly && !force) {
    try {
      const ss = await runDueSavedSearches(env, db);
      if (ss.errors.length) report.errors.push(...ss.errors.map((e) => `saved search ${e}`));
      if (ss.ran.length) report.errors.push(`ran saved searches: ${ss.ran.join(", ")}`);
    } catch (err) {
      report.errors.push(`saved searches: ${(err as Error).message}`);
    }
  }

  for (const mb of mailboxes) {
    const entry: DispatchReport["mailboxes"][number] = {
      email: mb.email,
      sent: 0,
      remaining_today: 0,
    };
    report.mailboxes.push(entry);
    try {
      // --- inbox sync first (cheap, and it may stop sequences before we send) ---
      if (!force) entry.synced = await syncMailbox(env, db, mb);

      if (opts.syncOnly) continue;
      if (!force && !inWindow(mb)) {
        entry.skipped = `outside send hours (${String(mb.window_start).padStart(2, "0")}:00–${String(mb.window_end).padStart(2, "0")}:00 ${mb.timezone}${mb.send_days.length < 7 ? ", " + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].filter((_, i) => mb.send_days.includes(i)).join("/") : ""}) — use "Send now" to override`;
        continue;
      }
      const sentToday = (
        await db.select<{ id: string }>(
          "messages",
          `mailbox_id=eq.${mb.id}&direction=eq.out&status=eq.sent&sent_at=gte.${enc(startOfLocalDayIso(mb.timezone))}&select=id`,
        )
      ).length;
      const remaining = Math.max(0, mb.daily_cap - sentToday);
      entry.remaining_today = remaining;
      if (!remaining) {
        entry.skipped = "daily cap reached";
        continue;
      }

      // Due enrollments for this mailbox, oldest first.
      const seqIds = activeSequences.filter((s) => s.mailbox_ids.includes(mb.id)).map((s) => s.id);
      if (!seqIds.length) {
        entry.skipped = "no active sequence uses this mailbox";
        continue;
      }
      const dueFilter = force
        ? `status=in.(queued,active,paused)${
            force.enrollmentIds?.length
              ? `&id=in.(${force.enrollmentIds.slice(0, 200).join(",")})`
              : force.sequenceId
                ? `&sequence_id=eq.${force.sequenceId}`
                : `&next_send_at=lte.${enc(new Date().toISOString())}`
          }`
        : `status=in.(queued,active)&next_send_at=lte.${enc(new Date().toISOString())}`;
      const due = await db.select<Enrollment>(
        "enrollments",
        `${dueFilter}&sequence_id=in.(${seqIds.join(",")})&or=(mailbox_id.eq.${mb.id},mailbox_id.is.null)&select=*&order=next_send_at.asc&limit=${Math.min(remaining, maxPerRun)}`,
      );

      if (due.length && !isGhl(mb)) await accessTokenFor(env, db, mb.id); // fail fast on a dead Google connection

      for (const en of due) {
        // Claim it for this mailbox (unassigned enrollments round-robin by whoever gets there first).
        if (!en.mailbox_id)
          await db.update("enrollments", `id=eq.${en.id}&mailbox_id=is.null`, {
            mailbox_id: mb.id,
          });

        const seq = seqById.get(en.sequence_id);
        if (!seq) continue;
        const steps = await db.select<Step>(
          "sequence_steps",
          `sequence_id=eq.${seq.id}&select=*&order=position.asc`,
        );
        const step = steps[en.current_step];
        if (!step) {
          await db.update("enrollments", `id=eq.${en.id}`, {
            status: "completed",
            completed_at: new Date().toISOString(),
          });
          continue;
        }
        const lead = await db.one<Lead>("leads", `id=eq.${en.lead_id}&select=*`);
        if (!lead?.email) {
          await db.update("enrollments", `id=eq.${en.id}`, {
            status: "skipped",
            last_error: "lead has no email",
          });
          continue;
        }
        const suppressed = await db.one(
          "suppressions",
          `or=(email.eq.${enc(lead.email.toLowerCase())}${lead.domain ? `,domain.eq.${enc(lead.domain)}` : ""})&select=id`,
        );
        if (suppressed) {
          await db.update("enrollments", `id=eq.${en.id}`, {
            status: "unsubscribed",
            last_error: "on suppression list",
          });
          continue;
        }
        // Automatic bounce check BEFORE the first send: never-verified addresses
        // are checked once (Reoon SMTP check if configured, else MX). A dead
        // address is suppressed and pulled from every sequence.
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
          continue;
        }

        const unsubscribeUrl = `${opts.origin || env.PUBLIC_ORIGIN || process.env?.PUBLIC_ORIGIN || "https://inspirovamarketing.com"}/api/unsub?t=${en.unsub_token}`;
        const variant = en.variant === "B" ? "B" : "A";
        const pickSubject = (st: Step) =>
          variant === "B" && st.subject_b?.trim() ? st.subject_b : st.subject;
        const rendered = renderStep({
          step: { ...step, subject: pickSubject(step) },
          lead,
          mailbox: mb,
          settings,
          unsubscribeUrl,
          isFollowUp: en.current_step > 0,
          firstSubject: steps[0] ? pickSubject(steps[0]) : "",
        });
        try {
          const sent = await sendVia(env, db, mb, {
            to: { name: lead.contact_name, email: lead.email },
            subject: rendered.subject,
            text: rendered.text,
            html: rendered.html,
            threadId: en.current_step > 0 ? en.thread_id || undefined : undefined,
            inReplyTo: en.current_step > 0 ? en.first_message_id || undefined : undefined,
            unsubscribeUrl,
            company: lead.company,
            phone: lead.phone,
          });
          const messageId = sent.rfcMessageId;
          await db.insert("messages", {
            enrollment_id: en.id,
            lead_id: lead.id,
            mailbox_id: mb.id,
            direction: "out",
            step_position: step.position,
            gmail_message_id: sent.id,
            gmail_thread_id: sent.threadId,
            rfc_message_id: messageId,
            subject: rendered.subject,
            snippet: rendered.text.slice(0, 160),
            kind: "email",
            status: "sent",
            variant,
          });
          const nextStep = steps[en.current_step + 1];
          const patch: Record<string, unknown> = {
            status: nextStep ? "active" : "completed",
            current_step: en.current_step + 1,
            mailbox_id: mb.id,
            thread_id: en.thread_id || sent.threadId,
            first_message_id: en.first_message_id || messageId,
            last_error: null,
          };
          if (nextStep) {
            const delayMs = Math.max(1, nextStep.delay_days) * 86_400_000 + rand(0, 3 * 3600_000);
            patch.next_send_at = nextWindowTime(mb, delayMs).toISOString();
          } else {
            patch.completed_at = new Date().toISOString();
          }
          await db.update("enrollments", `id=eq.${en.id}`, patch);
          entry.sent++;
        } catch (err) {
          const msg = (err as Error).message;
          await db.insert("messages", {
            enrollment_id: en.id,
            lead_id: lead.id,
            mailbox_id: mb.id,
            direction: "out",
            step_position: step.position,
            subject: rendered.subject,
            kind: "email",
            status: "failed",
            error: msg.slice(0, 500),
          });
          // Hard failures on the address → skip; transient → retry in an hour.
          const hard = /invalid|address not found|recipient/i.test(msg);
          await db.update(
            "enrollments",
            `id=eq.${en.id}`,
            hard
              ? { status: "failed", last_error: msg.slice(0, 500) }
              : {
                  next_send_at: new Date(Date.now() + 3600_000).toISOString(),
                  last_error: msg.slice(0, 500),
                },
          );
          if (/401|403|invalid_grant/i.test(msg)) break; // mailbox auth problem — stop this mailbox for now
        }
        // Human-looking gap between sends (short when someone is waiting at the screen).
        if (due.indexOf(en) < due.length - 1)
          await sleep(force ? rand(3, 8) * 1000 : rand(seq.gap_min_sec, seq.gap_max_sec) * 1000);
      }
    } catch (err) {
      const msg = (err as Error).message;
      report.errors.push(`${mb.email}: ${msg}`);
      await db
        .update("mailboxes", `id=eq.${mb.id}`, { last_error: msg.slice(0, 500) })
        .catch(() => {});
    }
  }
  return report;
}

/** Look at the mailbox inbox for replies / bounces to our threads. */
async function syncMailbox(
  env: Env,
  db: Db,
  mb: Mailbox,
): Promise<{ replies: number; bounces: number; stops: number }> {
  const out = { replies: 0, bounces: 0, stops: 0 };
  if (isGhl(mb)) return syncGhlMailbox(env, db, mb);
  const token = await accessTokenFor(env, db, mb.id);
  const ids = await gmailListRecent(token, "in:inbox newer_than:3d", 60);
  if (!ids.length) {
    await db.update("mailboxes", `id=eq.${mb.id}`, {
      last_sync_at: new Date().toISOString(),
      last_error: null,
    });
    return out;
  }
  // Skip ones we've already recorded.
  const known = new Set(
    (
      await db.select<{ gmail_message_id: string }>(
        "messages",
        `gmail_message_id=in.(${ids.map((i) => `"${i}"`).join(",")})&select=gmail_message_id`,
      )
    ).map((m) => m.gmail_message_id),
  );
  for (const id of ids) {
    if (known.has(id)) continue;
    const m = await gmailGetHeaders(token, id);
    if (!m) continue;

    // Bounce: find the failed recipient and suppress.
    if (isBounce(m)) {
      const failed = (
        m.failedRecipients ||
        m.snippet.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ||
        ""
      )
        .toLowerCase()
        .trim();
      const en = m.threadId
        ? await db.one<Enrollment>("enrollments", `thread_id=eq.${enc(m.threadId)}&select=*`)
        : null;
      const lead = en
        ? await db.one<Lead>("leads", `id=eq.${en.lead_id}&select=*`)
        : failed
          ? await db.one<Lead>("leads", `email=ilike.${enc(failed)}&select=*`)
          : null;
      const email = (lead?.email || failed || "").toLowerCase();
      const kind = classifyBounce(m.subject, m.snippet);
      if (kind === "hard") {
        await applyHardBounce(db, {
          email,
          lead,
          enrollmentId: en?.id ?? null,
          reason: "bounce",
          note: `${m.subject} — ${m.snippet}`.slice(0, 200),
        });
      } else {
        const r = await applySoftBounce(db, en, m.snippet);
        if (r === "gave_up")
          await applyHardBounce(db, {
            email,
            lead,
            enrollmentId: en?.id ?? null,
            reason: "bounce",
            note: `soft bounce twice: ${m.snippet}`.slice(0, 200),
          });
      }
      await db
        .insert("messages", {
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
        })
        .catch(() => {});
      out.bounces++;
      continue;
    }

    // Reply to one of our threads?
    const en = await db.one<Enrollment>("enrollments", `thread_id=eq.${enc(m.threadId)}&select=*`);
    if (!en) continue; // unrelated inbox mail
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
    const stop = intent === "not_interested" || wantsToStop(m.subject) || wantsToStop(bodyText);
    if (stop && lead?.email) {
      await db
        .upsert(
          "suppressions",
          {
            email: lead.email.toLowerCase(),
            domain: lead.domain,
            reason: "replied_stop",
            note: m.snippet.slice(0, 200),
          },
          "email",
        )
        .catch(() => {});
      out.stops++;
    }
    const seq = await db.one<Sequence>("sequences", `id=eq.${en.sequence_id}&select=stop_on_reply`);
    if (stop || seq?.stop_on_reply !== false) {
      await db.update("enrollments", `id=eq.${en.id}`, {
        status: stop ? "unsubscribed" : "replied",
        replied_at: new Date(m.internalDate || Date.now()).toISOString(),
      });
    }
    out.replies++;
  }
  await db.update("mailboxes", `id=eq.${mb.id}`, {
    last_sync_at: new Date().toISOString(),
    last_error: null,
  });
  return out;
}
