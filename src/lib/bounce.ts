/**
 * Bounce protection for every sending channel.
 *
 *  BEFORE a send:  verifyEmail() — Reoon (SMTP-level) when REOON_API_KEY is set,
 *                  otherwise a free MX lookup. Invalid → the address is marked,
 *                  suppressed and never sent to, in any sequence.
 *  AFTER a send:   classifyBounce() tells a HARD bounce (address doesn't exist)
 *                  from a SOFT one (mailbox full, greylisting, "try later").
 *                  Hard → applyHardBounce(): suppress + mark invalid + stop every
 *                  enrollment of that lead. Soft → retry once, two days later.
 */

import { Db, enc } from "./db";
import { hasMx } from "./providers/free-enrich";

type Env = Record<string, string | undefined>;

export type VerifyStatus = "valid" | "invalid" | "risky" | "mx_ok" | "unknown";

/** Trim, lowercase, drop stray trailing punctuation scraped from a page. */
export function normalizeEmail(email: string): string {
  return (email || "")
    .trim()
    .toLowerCase()
    .replace(/^mailto:/, "")
    .replace(/[.,;:)\]]+$/, "");
}

const EMAIL_SYNTAX = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
/** Cheap syntax check — what GHL/Gmail will refuse outright. */
export function looksLikeEmail(email: string): boolean {
  return EMAIL_SYNTAX.test(normalizeEmail(email)) && !/\.\./.test(email);
}

/** Reoon when configured (power mode = real SMTP check), else MX only. */
export async function verifyEmail(env: Env, email: string): Promise<VerifyStatus> {
  const key = env.REOON_API_KEY;
  email = normalizeEmail(email);
  if (!looksLikeEmail(email)) return "invalid";
  const domain = email.split("@")[1] || "";
  if (!domain || !domain.includes(".")) return "invalid";
  if (key) {
    try {
      const u = new URL("https://emailverifier.reoon.com/api/v1/verify");
      u.searchParams.set("email", email);
      u.searchParams.set("key", key);
      u.searchParams.set("mode", "power");
      const res = await fetch(u.toString(), { signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const j = (await res.json()) as { status?: string; is_safe_to_send?: boolean };
        const st = (j.status || "").toLowerCase();
        if (st === "safe" || st === "valid" || j.is_safe_to_send) return "valid";
        if (st === "invalid" || st === "disabled" || st === "disposable") return "invalid";
        return "risky";
      }
    } catch {
      /* fall back to MX */
    }
  }
  const mx = await hasMx(domain);
  return mx === true ? "mx_ok" : mx === false ? "invalid" : "unknown";
}

const HARD_RE =
  /\b5\.[0-9]\.[0-9]\b|\b55[0-9]\b|does not exist|no such (user|recipient|mailbox)|user unknown|unknown user|unknown recipient|address not found|recipient (address )?rejected|address rejected|mailbox (not found|unavailable|does not exist|is disabled)|invalid (recipient|mailbox|address)|not a valid (recipient|mailbox)|no mailbox here|unrouteable|domain not found|host or domain name not found|nxdomain|couldn't be delivered|wasn't delivered|was not delivered|permanent(ly)? (error|failure|rejected)|account (has been )?(disabled|closed)/i;
const SOFT_RE =
  /\b4\.[0-9]\.[0-9]\b|\b4[25][0-9]\b|mailbox (is )?full|over quota|quota exceeded|temporar|try again later|deferred|delay(ed)?|greylist|rate limit|too many (messages|connections)|connection timed out|server busy|will retry|has been delayed|not yet delivered/i;

/** Hard = the address is dead, never send again. Soft = retry later. */
export function classifyBounce(subject: string, text: string): "hard" | "soft" {
  const s = `${subject}\n${text}`;
  if (/delivery status notification \(delay\)|delivery delayed|delivery incomplete/i.test(subject))
    return "soft";
  if (HARD_RE.test(s)) return "hard";
  if (SOFT_RE.test(s)) return "soft";
  // Unknown wording with a failure subject: treat as hard — a second send to a
  // dead address costs reputation; a wrongly skipped one costs nothing.
  return "hard";
}

/**
 * One hard bounce (or a failed pre-send check): suppress the address, flag the
 * lead, stop THIS enrollment and every other queued/active one for the lead.
 */
export async function applyHardBounce(
  db: Db,
  p: {
    email: string;
    lead?: { id: string; domain?: string | null } | null;
    enrollmentId?: string | null;
    reason: "bounce" | "verify_invalid";
    note: string;
  },
): Promise<void> {
  const email = p.email.toLowerCase().trim();
  if (email)
    await db
      .upsert(
        "suppressions",
        {
          email,
          domain: p.lead?.domain ?? null,
          reason: "bounce", // suppressions.reason is a fixed set; the note says whether it was pre-send
          note: (p.reason === "verify_invalid" ? `pre-send: ${p.note}` : p.note).slice(0, 200),
        },
        "email",
      )
      .catch(() => {});
  if (p.lead?.id)
    await db.update("leads", `id=eq.${p.lead.id}`, { email_verified: "invalid" }).catch(() => {});
  if (p.enrollmentId)
    await db
      .update("enrollments", `id=eq.${p.enrollmentId}`, {
        status: "bounced",
        last_error:
          p.reason === "bounce" ? `bounced: ${p.note.slice(0, 120)}` : p.note.slice(0, 160),
      })
      .catch(() => {});
  // Every other sequence this lead sits in: stop before it bounces again.
  if (p.lead?.id)
    await db
      .update(
        "enrollments",
        `lead_id=eq.${p.lead.id}&status=in.(queued,active,paused)${p.enrollmentId ? `&id=neq.${p.enrollmentId}` : ""}`,
        { status: "bounced", last_error: "email bounced in another sequence" },
      )
      .catch(() => {});
}

/** A soft bounce: push the enrollment two days out; a second one becomes hard. */
export async function applySoftBounce(
  db: Db,
  en: { id: string; last_error?: string | null } | null,
  note: string,
): Promise<"retry" | "gave_up"> {
  if (!en) return "retry";
  if (/soft bounce/i.test(en.last_error || "")) return "gave_up";
  await db
    .update("enrollments", `id=eq.${en.id}`, {
      next_send_at: new Date(Date.now() + 2 * 86400e3).toISOString(),
      last_error: `soft bounce — retrying in 2 days (${note.slice(0, 100)})`,
    })
    .catch(() => {});
  return "retry";
}

/** The pre-send gate used by the sequencer. */
export async function preSendCheck(
  env: Env,
  db: Db,
  lead: { id: string; email: string; domain?: string | null; email_verified?: string },
): Promise<{ ok: true; status: VerifyStatus } | { ok: false; reason: string }> {
  const current = (lead.email_verified || "unknown") as VerifyStatus;
  if (current === "invalid") return { ok: false, reason: "email marked invalid" };
  if (!looksLikeEmail(lead.email)) return { ok: false, reason: "not a valid email address" };
  if (current === "valid" || current === "mx_ok" || current === "risky")
    return { ok: true, status: current };
  const status = await verifyEmail(env, lead.email);
  await db.update("leads", `id=eq.${lead.id}`, { email_verified: status }).catch(() => {});
  if (status === "invalid")
    return {
      ok: false,
      reason: env.REOON_API_KEY
        ? "verifier says the address is invalid"
        : "domain has no mail server",
    };
  return { ok: true, status };
}

export function isInvalidRecipientError(message: string): boolean {
  return /INVALID_EMAIL|e-mail is invalid|email is invalid|invalid (to|recipient|address)|address not found|no such recipient/i.test(message);
}

export { enc };
