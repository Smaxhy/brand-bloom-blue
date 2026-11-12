/**
 * "Why isn't it sending?" — a dry run of every check the dispatcher makes,
 * explained in plain language. Nothing is sent or changed.
 */

import { Db, enc } from "./db";
import { gapLabel, sendEtaMinutes, spreadGapSeconds } from "./dispatch-pacing";
import {
  inWindow,
  nextWindowTime,
  startOfLocalDayIso,
  localParts,
  spreadDay,
  sendsFromAnyMailbox,
  usesMailbox,
  type Mailbox,
  type Sequence,
} from "./sequencer";
import { CANT_SEND, cantSend, shownMailboxError } from "./send-errors";



export interface MailboxStatus {
  id: string;
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
  /** How this mailbox paces itself, e.g. "one email about every 36 min — 40 a day, spread around the clock". */
  pace: string | null;
  /** It is sending as planned and simply waiting for the next slot. */
  on_schedule: boolean;
  /** When the next email is due (only while people are waiting and it is on schedule). */
  next_send_at: string | null;
  /** It could send, but no Active sequence sends from it — offer to link it. */
  unlinked: boolean;
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
  const settings = await db.select<{ last_cron_at: string | null; last_tick_source?: string | null }>("outreach_settings", "id=eq.singleton&select=*");
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

  const existingIds = new Set(mailboxes.map((m) => m.id));
  // An Active sequence none of whose mailboxes can send: nothing in it moves.
  for (const sq of active) {
    if (sendsFromAnyMailbox(sq, existingIds)) continue;
    const own = mailboxes.filter((m) => (sq.mailbox_ids || []).includes(m.id));
    if (!own.length) out.blockers.push(`Sequence "${sq.name}" has no mailbox picked — open it and tick a mailbox under "Send from".`);
    else if (own.every((m) => cantSend(m)))
      out.blockers.push(
        `Sequence "${sq.name}" can't send: ${own.map((m) => m.email).join(", ")} ${own.length === 1 ? "is" : "are"} paused or not connected. Reconnect ${own.length === 1 ? "it" : "them"} in Settings, or open the sequence and tick a working mailbox under "Send from".`,
      );
  }

  for (const mb of mailboxes) {
    const seqsHere = active.filter((s) => usesMailbox(s, mb.id, existingIds));
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

    const shownError = shownMailboxError(mb.last_error, mb.provider);
    const blockedBySend = (mb.last_error || "").startsWith(CANT_SEND);
    const reasons: string[] = [];
    const notes: string[] = [];
    if (mb.status === "paused") reasons.push("this mailbox is paused — press ▶ on it in Settings → Sending mailboxes");
    else if (mb.status !== "active") reasons.push(shownError ?? `this mailbox needs reconnecting (${mb.status}) — Settings → Sending mailboxes`);
    else if (blockedBySend && shownError) reasons.push(`${shownError} It tries again by itself every 15 minutes.`);
    else if (shownError) notes.push(shownError);
    const unlinked = !seqsHere.length && active.length > 0 && !cantSend(mb);
    if (!seqsHere.length)
      reasons.push(
        active.length
          ? "no Active sequence sends from this mailbox — the button below adds it to your Active sequences"
          : "no Active sequence sends from this mailbox",
      );
    if (!inHours && !anytime) {
      const next = nextWindowTime(mb, 0);
      reasons.push(
        `outside sending hours (${String(mb.window_start).padStart(2, "0")}:00–${String(mb.window_end).padStart(2, "0")}:00 ${mb.timezone}; it's ${String(hour).padStart(2, "0")}:00 there) — resumes ${next.toLocaleString("en-GB", { timeZone: mb.timezone, weekday: "short", hour: "2-digit", minute: "2-digit" })}. Tick "Send any time" on the sequence or press ▶ / Send now.`,
      );
    }
    if (sentToday >= mb.daily_cap)
      reasons.push(
        `daily cap reached (${sentToday}/${mb.daily_cap}) — resets at midnight ${mb.timezone}. The permanent combined limit remains 40 in 24 hours.`,
      );
    if (seqsHere.length && !waiting.length)
      reasons.push("nobody is waiting in its sequences — add people");
    else if (seqsHere.length && !dueNow && nextDue)
      reasons.push(
        `nobody is due yet — next send scheduled ${new Date(nextDue).toLocaleString("en-GB", { timeZone: mb.timezone, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} (${mb.timezone})`,
      );

    // The pace: the day's cap spread over the sending day (same sum as the sender).
    const gapMin = eligible.length ? Math.min(...eligible.map((q) => q.gap_min_sec ?? 45)) : 45;
    const gapMax = eligible.length ? Math.max(...eligible.map((q) => q.gap_max_sec ?? 180)) : 180;
    const day = spreadDay(mb, anytime, now);
    const spreadSec = spreadGapSeconds({ dailyCap: mb.daily_cap, sentToday, ...day });
    const evenSec = Math.floor(day.windowSec / Math.max(1, mb.daily_cap));
    const over = day.windowSec >= 86_400 ? "around the clock" : `over its ${Math.round(day.windowSec / 3600)} sending hours`;
    const pace = !eligible.length
      ? null
      : spreadSec > gapMax
        ? `one email about every ${gapLabel(spreadSec)} — ${mb.daily_cap} a day, spread ${over}${spreadSec < evenSec * 0.9 ? " (catching up today)" : ""}`
        : `${gapMin}–${gapMax} s between emails (the daily cap of ${mb.daily_cap} allows the sequence's own pace)`;

    // When is the next one due? Only worth a look when nothing else is in the way.
    let nextSendAt: string | null = null;
    let onSchedule = false;
    if (!reasons.length && dueNow > 0) {
      const [paceRow, last] = await Promise.all([
        db.select<{ window_start: string }>("rate_limits", `key=eq.${enc(`pace:${mb.id}`)}&select=window_start&limit=1`).catch(() => []),
        db
          .select<{ sent_at: string }>("messages", `mailbox_id=eq.${mb.id}&direction=eq.out&status=eq.sent&select=sent_at&order=sent_at.desc&limit=1`)
          .catch(() => []),
      ]);
      const planned = paceRow[0]?.window_start ? Date.parse(paceRow[0].window_start) || 0 : 0;
      const lastSent = last[0]?.sent_at ? Date.parse(last[0].sent_at) || 0 : 0;
      const floor = lastSent ? lastSent + Math.max(gapMin, Math.floor(spreadSec * 0.85)) * 1000 : 0;
      const at = Math.max(planned, floor);
      if (at > now.getTime() + 60_000) {
        nextSendAt = new Date(at).toISOString();
        onSchedule = true;
        const mins = Math.round((at - now.getTime()) / 60_000);
        notes.unshift(
          `On schedule: next email at about ${new Date(at).toLocaleString("en-GB", { timeZone: mb.timezone, hour: "2-digit", minute: "2-digit" })} (in ${mins} min).`,
        );
      }
    }

    const eta = waiting.length
      ? sendEtaMinutes({
          waiting: dueNow || waiting.length,
          gapMinSec: gapMin,
          gapMaxSec: gapMax,
          dailyCap: mb.daily_cap,
          sentToday,
          ...(anytime ? { windowStartHour: 0, windowEndHour: 24 } : { windowStartHour: mb.window_start, windowEndHour: mb.window_end }),
        })
      : null;
    const etaText = !eta
      ? null
      : eta.days
        ? `≈ ${eta.days + 1} days (daily cap ${mb.daily_cap})`
        : eta.minutes >= 60
          ? `≈ ${Math.floor(eta.minutes / 60)} h ${eta.minutes % 60} min`
          : `≈ ${Math.max(1, eta.minutes)} min`;
    const syncAgeMin = mb.last_sync_at ? (now.getTime() - Date.parse(mb.last_sync_at)) / 60000 : Infinity;
    const followUpsDue = waiting.filter(
      (w) => (w.current_step ?? 0) > 0 && w.next_send_at && Date.parse(w.next_send_at) <= now.getTime(),
    ).length;
    if (followUpsDue && syncAgeMin >= 10)
      notes.push(
        `${followUpsDue} follow-up${followUpsDue === 1 ? "" : "s"} wait until the inbox has been checked (${Number.isFinite(syncAgeMin) ? `last check ${Math.round(syncAgeMin)} min ago` : "never checked"}) so replies and opt-outs are read first. First emails still go out.`,
      );
    out.mailboxes.push({
      id: mb.id,
      notes,
      eta: etaText,
      pace,
      on_schedule: onSchedule,
      next_send_at: nextSendAt,
      unlinked,
      email: mb.email,
      provider: mb.provider || "google",
      status: mb.status,
      can_send_now: reasons.length === 0 && !onSchedule,
      reasons,
      sent_today: sentToday,
      daily_cap: mb.daily_cap,
      in_hours: inHours || anytime,
      hours: anytime
        ? `any time (${mb.timezone})`
        : `${String(mb.window_start).padStart(2, "0")}:00–${String(mb.window_end).padStart(2, "0")}:00 ${mb.timezone}`,
      local_time: `${String(hour).padStart(2, "0")}:00`,
      due_now: dueNow,
      next_due_at: nextDue,
      waiting_total: waiting.length,
      last_sync_at: mb.last_sync_at ?? null,
      last_error: shownError,
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
