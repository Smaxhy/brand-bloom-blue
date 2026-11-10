/**
 * "Why isn't it sending?" — a dry run of every check the dispatcher makes,
 * explained in plain language. Nothing is sent or changed.
 */

import { Db, enc } from "./db";
import { sendEtaMinutes } from "./dispatch-pacing";
import {
  inWindow,
  nextWindowTime,
  startOfLocalDayIso,
  localParts,
  type Mailbox,
  type Sequence,
} from "./sequencer";



export interface MailboxStatus {
  email: string;
  provider: string;
  status: string;
  can_send_now: boolean;
  reasons: string[]; // why it can't (empty when it can)
  sent_today: number;
  daily_cap: number;
  in_hours: boolean;
  hours: string;
  local_time: string;
  due_now: number;
  next_due_at: string | null;
  waiting_total: number;
  last_sync_at: string | null;
  last_error: string | null;
  sequences: string[];
  /** Plain-language "when will the queue be through", e.g. "≈ 2 h 10 min" or "≈ 3 days (daily cap 100)". */
  eta: string | null;
  /** The sequences' gap between two emails from this mailbox, e.g. "45–180 s". */
  pace: string | null;
  /** Things worth knowing that don't stop sending (e.g. follow-ups waiting for an inbox check). */
  notes: string[];
}

export interface SendingStatus {
  checked_at: string;
  scheduler: { ok: boolean; last_seen: string | null; note: string; source: string | null };
  mailboxes: MailboxStatus[];
  blockers: string[]; // top-level, plain language
}

export async function sendingStatus(db: Pick<Db, "select">): Promise<SendingStatus> {
  const now = new Date();
  const out: SendingStatus = {
    checked_at: now.toISOString(),
    scheduler: { ok: false, last_seen: null, note: "", source: null },
    mailboxes: [],
    blockers: [],
  };

  const mailboxes = await db.select<Mailbox>("mailboxes", "select=*&order=created_at.asc");
  const sequences = await db.select<Sequence>("sequences", "status=neq.archived&select=*");
  const active = sequences.filter((s) => s.status === "active");

  // Only a background scheduler (cron, database timer, outside pinger) stamps
  // this heartbeat; a manual sync or an open admin tab is not proof.
  const settings = await db.select<{ last_cron_at: string | null; last_tick_source?: string | null; spread_across_day?: boolean | null }>("outreach_settings", "id=eq.singleton&select=*");
  const spreadDay = !!settings[0]?.spread_across_day;
  const lastSeen = settings[0]?.last_cron_at;
  const source = settings[0]?.last_tick_source ?? null;
  const ageMin = lastSeen ? (now.getTime() - Date.parse(lastSeen)) / 60000 : Infinity;
  const via =
    source === "db" ? "database timer" : source === "cron" ? "Cloudflare cron" : source === "external" ? "outside timer" : "scheduler";
  out.scheduler = {
    ok: ageMin <= 25,
    last_seen: lastSeen ?? null,
    source,
    note:
      ageMin <= 3
        ? `Background sending is on (${via}, last ran ${ageMin < 1 ? "just now" : `${Math.round(ageMin)} min ago`}) — it keeps going with the app closed.`
        : ageMin <= 25
          ? `Background ${via} last ran ${Math.round(ageMin)} min ago — slower than the expected once a minute.`
          : lastSeen
            ? `No background timer has run for ${ageMin < 120 ? `${Math.round(ageMin)} min` : `${Math.round(ageMin / 60)} h`}: emails only go out while the admin is open. Turn on Settings → Background timer.`
            : "No background timer yet: emails only go out while the admin is open. Turn on Settings → Background timer.",
  };

  if (!mailboxes.some((m) => m.status === "active"))
    out.blockers.push("No active mailbox. Settings → connect Google or GoHighLevel.");
  if (!active.length)
    out.blockers.push(
      sequences.length
        ? "No sequence is Active — press ▶ on a sequence (paused/draft ones never send)."
        : "No sequences yet — Outreach → Sequences → New sequence.",
    );

  for (const mb of mailboxes) {
    const seqsHere = active.filter((s) => s.mailbox_ids.includes(mb.id));
    const eligible = inWindow(mb) ? seqsHere : seqsHere.filter((s) => s.send_anytime);
    const anytime = seqsHere.some((s) => s.send_anytime);
    const inHours = inWindow(mb);
    const { hour } = localParts(mb.timezone);
    const sentToday = (
      await db.select<{ id: string }>(
        "messages",
        // Same count as the sender: a sent email later marked "bounced" still used a slot.
        `mailbox_id=eq.${mb.id}&direction=eq.out&status=in.(sent,bounced)&sent_at=gte.${enc(startOfLocalDayIso(mb.timezone))}&select=id`,
      )
    ).length;
    const seqIds = eligible.map((s) => s.id);
    const waiting = seqIds.length
      ? await db.select<{ id: string; next_send_at: string | null; current_step?: number }>(
          "enrollments",
          `status=in.(queued,active)&sequence_id=in.(${seqIds.join(",")})&or=(mailbox_id.eq.${mb.id},mailbox_id.is.null)&select=id,next_send_at,current_step&order=next_send_at.asc&limit=1000`,
        )
      : [];
    const dueNow = waiting.filter(
      (w) => w.next_send_at && Date.parse(w.next_send_at) <= now.getTime(),
    ).length;
    const nextDue = waiting[0]?.next_send_at ?? null;

    const reasons: string[] = [];
    if (mb.status !== "active") reasons.push(`mailbox is ${mb.status}`);
    if (mb.last_error) reasons.push("Mailbox reported an error. Check its connection in Settings.");
    if (!seqsHere.length) reasons.push("no Active sequence uses this mailbox");
    if (!inHours && !anytime) {
      const next = nextWindowTime(mb, 0);
      reasons.push(
        `outside sending hours (${String(mb.window_start).padStart(2, "0")}:00–${String(mb.window_end).padStart(2, "0")}:00 ${mb.timezone}; it's ${String(hour).padStart(2, "0")}:00 there) — resumes ${next.toLocaleString("en-GB", { timeZone: mb.timezone, weekday: "short", hour: "2-digit", minute: "2-digit" })}. Tick "Send any time" on the sequence or press ▶ / Send now.`,
      );
    }
    if (sentToday >= mb.daily_cap)
      reasons.push(
        `daily cap reached (${sentToday}/${mb.daily_cap}) — resets at midnight ${mb.timezone}. Raise it in Settings → mailbox.`,
      );
    if (seqsHere.length && !waiting.length)
      reasons.push("nobody is waiting in its sequences — add people");
    else if (seqsHere.length && !dueNow && nextDue)
      reasons.push(
        `nobody is due yet — next send scheduled ${new Date(nextDue).toLocaleString("en-GB", { timeZone: mb.timezone, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} (${mb.timezone})`,
      );

    const gapMin = eligible.length ? Math.min(...eligible.map((q) => q.gap_min_sec ?? 45)) : 45;
    const gapMax = eligible.length ? Math.max(...eligible.map((q) => q.gap_max_sec ?? 180)) : 180;
    const eta = waiting.length
      ? sendEtaMinutes({ waiting: dueNow || waiting.length, gapMinSec: gapMin, gapMaxSec: gapMax, dailyCap: mb.daily_cap, sentToday, ...(spreadDay ? { windowStartHour: mb.window_start, windowEndHour: mb.window_end } : {}) })
      : null;
    const etaText = !eta
      ? null
      : eta.days
        ? `≈ ${eta.days + 1} days (daily cap ${mb.daily_cap})`
        : eta.minutes >= 60
          ? `≈ ${Math.floor(eta.minutes / 60)} h ${eta.minutes % 60} min`
          : `≈ ${Math.max(1, eta.minutes)} min`;
    const notes: string[] = [];
    const syncAgeMin = mb.last_sync_at ? (now.getTime() - Date.parse(mb.last_sync_at)) / 60000 : Infinity;
    const followUpsDue = waiting.filter(
      (w) => (w.current_step ?? 0) > 0 && w.next_send_at && Date.parse(w.next_send_at) <= now.getTime(),
    ).length;
    if (followUpsDue && syncAgeMin >= 10)
      notes.push(
        `${followUpsDue} follow-up${followUpsDue === 1 ? "" : "s"} wait until the inbox has been checked (${Number.isFinite(syncAgeMin) ? `last check ${Math.round(syncAgeMin)} min ago` : "never checked"}) so replies and opt-outs are read first. First emails still go out.`,
      );
    out.mailboxes.push({
      notes,
      eta: etaText,
      pace: eligible.length ? `${gapMin}–${gapMax} s between emails` : null,
      email: mb.email,
      provider: mb.provider || "google",
      status: mb.status,
      can_send_now: reasons.length === 0,
      reasons,
      sent_today: sentToday,
      daily_cap: mb.daily_cap,
      in_hours: inHours || anytime,
      hours: `${String(mb.window_start).padStart(2, "0")}:00–${String(mb.window_end).padStart(2, "0")}:00 ${mb.timezone}`,
      local_time: `${String(hour).padStart(2, "0")}:00`,
      due_now: dueNow,
      next_due_at: nextDue,
      waiting_total: waiting.length,
      last_sync_at: mb.last_sync_at ?? null,
      last_error: mb.last_error ? "Mailbox reported an error. Check its connection in Settings." : null,
      sequences: seqsHere.map((s) => s.name),
    });
  }

  // People held after a send that got no clear answer (they may have received it).
  const held = mailboxes.length
    ? await db
        .select<{ id: string; mailbox_id: string | null }>(
          "enrollments",
          `status=in.(paused,failed)&last_error=like.${enc("Possibly sent*")}&select=id,mailbox_id&limit=500`,
        )
        .catch(() => [] as { id: string; mailbox_id: string | null }[])
    : [];
  mailboxes.forEach((mb, i) => {
    const n = held.filter((h) => h.mailbox_id === mb.id).length;
    if (n && out.mailboxes[i])
      out.mailboxes[i].notes.push(
        `${n} ${n === 1 ? "person is" : "people are"} on hold as "possibly sent": the email provider didn't answer clearly, so it may have gone out. Check the Sent folder, then press ▶ on them in People to send, or leave them.`,
      );
  });

  if (!out.scheduler.ok) out.blockers.unshift(out.scheduler.note);
  return out;
}
