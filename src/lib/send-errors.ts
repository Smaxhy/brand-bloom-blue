/**
 * Which send errors mean "this whole mailbox can't send right now" (stop the
 * mailbox, keep everyone queued) versus "this one recipient failed" (carry on
 * with the next person). The old check matched "403" anywhere in the error
 * text — a contact id or phone number containing 403 stopped the mailbox.
 */

/** The provider rejected our credentials / connection, not the recipient. */
export function isMailboxAuthError(message: string): boolean {
  const m = message || "";
  if (isRateLimited(m)) return false; // "slow down" (Gmail says that with a 403 too) is not a login problem
  if (/^(gmail send|gmail list|GHL (send|upsert|location token|conversations|messages)) 40[13]\b/i.test(m)) return true;
  return /invalid_grant|token refresh failed|mailbox not connected|GHL mailbox is not connected|GHL returned no location token|UNAUTHENTICATED|invalid[_ ]credentials/i.test(m);
}

/** The provider says "slow down" for the whole mailbox / location (after its own retries). */
export function isRateLimited(message: string): boolean {
  const m = message || "";
  if (/^(gmail send|GHL (send|upsert|location token)) 429\b/i.test(m)) return true;
  // Gmail answers sending limits with a 403 and one of these reasons.
  return /^gmail send 403\b[\s\S]*(rateLimitExceeded|userRateLimitExceeded|dailyLimitExceeded|quotaExceeded|sending limit)/i.test(m);
}

/** The provider refused THIS recipient or message (a 4xx that isn't about the login or a rate limit). */
export function isRecipientRefusal(message: string): boolean {
  const m = message || "";
  return /^(gmail send|GHL (send|upsert)) 4\d\d\b/i.test(m) && !isRateLimited(m) && !isMailboxAuthError(m);
}

/** The connection is gone for good until someone reconnects it in Settings. */
export function isPermanentMailboxError(message: string): boolean {
  return /invalid_grant|mailbox not connected|GHL mailbox is not connected/i.test(message || "");
}

/** How a mailbox-level problem is stored on the mailbox while it can't send (see `cantSend`). */
export const CANT_SEND = "Cannot send: ";
/** The inbox can't be read (replies/opt-outs): follow-ups wait, first emails still go out. */
export const CANT_READ = "Cannot read the inbox: ";

/** The mailbox is switched off, or its connection is refused right now: nobody new should be given to it. */
export function cantSend(mb: { status?: string | null; last_error?: string | null }): boolean {
  return mb.status !== "active" || (mb.last_error || "").startsWith(CANT_SEND);
}

const WHERE = "Settings → Sending mailboxes";

/**
 * A mailbox-level problem in plain words, with what to do about it — never the
 * provider's own error text. `null` = not a known mailbox problem (or just a
 * "slow down", which sorts itself out).
 */
export function mailboxProblem(message: string, provider?: string | null): { text: string; reconnect: boolean } | null {
  const m = message || "";
  if (isRateLimited(m)) return null;
  if (/GHL mailbox is not connected|GHL returned no location token/i.test(m))
    return { text: `GoHighLevel isn't connected for this mailbox. Enter its API key and location again in ${WHERE}.`, reconnect: true };
  if (/mailbox not connected/i.test(m))
    return { text: `This mailbox isn't connected any more. Connect it again in ${WHERE}.`, reconnect: true };
  if (/invalid_grant|token refresh failed/i.test(m))
    return { text: `Google access for this mailbox expired or was withdrawn. Reconnect it in ${WHERE}.`, reconnect: true };
  const gmail = /^gmail (send|list|thread|message|get) (40[13])\b/i.exec(m);
  if (gmail) {
    const reading = gmail[1].toLowerCase() !== "send";
    if (gmail[2] === "401")
      return { text: `Google no longer accepts this mailbox's sign-in (error 401). Reconnect it in ${WHERE}.`, reconnect: true };
    if (/accessNotConfigured|SERVICE_DISABLED|has not been used in project|it is disabled/i.test(m))
      return {
        text: "The Gmail API is switched off in your Google Cloud project (error 403). Turn it on there (APIs & Services → Library → Gmail API → Enable), wait a minute, then try again.",
        reconnect: false,
      };
    if (/insufficient|ACCESS_TOKEN_SCOPE|scope/i.test(m))
      return {
        text: `Google didn't give permission to ${reading ? "read" : "send from"} this mailbox (error 403). Reconnect it in ${WHERE} and tick every box on Google's permission screen.`,
        reconnect: true,
      };
    return {
      text: `Google refused to ${reading ? "let this mailbox's inbox be read" : "send from this mailbox"} (error 403). Usually a permission box wasn't ticked when it was connected, or the Google account was suspended or restricted: reconnect it in ${WHERE} and tick every box.`,
      reconnect: true,
    };
  }
  const ghl = /^GHL (send|upsert|location token|conversations|messages) (40[13])\b/i.exec(m);
  if (ghl || (provider === "ghl" && /UNAUTHENTICATED|invalid[_ ]credentials/i.test(m)))
    return {
      text: `GoHighLevel refused the connection (error ${ghl?.[2] ?? "401"}): the API key or location is no longer valid. Enter them again in ${WHERE}.`,
      reconnect: true,
    };
  if (/UNAUTHENTICATED|invalid[_ ]credentials/i.test(m))
    return { text: `The sign-in for this mailbox was refused. Reconnect it in ${WHERE}.`, reconnect: true };
  return null;
}

/**
 * What to show for a mailbox's stored error: text this app wrote itself is
 * shown as is, a known provider problem is put in plain words, and anything
 * else (possibly raw provider text from an older version) stays generic.
 */
export function shownMailboxError(lastError: string | null | undefined, provider?: string | null): string | null {
  const e = (lastError || "").trim();
  if (!e) return null;
  if (e.startsWith(CANT_SEND) || e.startsWith(CANT_READ)) return e;
  const known = mailboxProblem(e, provider) ?? (/^Token refresh failed/i.test(e) ? mailboxProblem("token refresh failed", provider) : null);
  return known?.text ?? "This mailbox reported a problem. Check its connection in Settings → Sending mailboxes.";
}

/**
 * The provider clearly did NOT send: refused before the send call (token,
 * contact, connection settings) or answered the send call with a 4xx.
 * Anything else at the send call (timeout, lost connection, 5xx) is unclear —
 * the email may have gone out.
 */
export function isClearRejection(message: string): boolean {
  const m = message || "";
  if (/^(gmail send|GHL send) 4\d\d\b/i.test(m)) return true;
  if (/^(GHL (upsert|location token)|token refresh failed|mailbox not connected|GHL mailbox is not connected|GHL returned no location token|GHL upsert returned no contact id)/i.test(m)) return true;
  return /invalid_grant|CONVERSATIONS_MSG_INVALID_EMAIL|Invalid To header/i.test(m);
}

/** The email certainly did not go out: it failed before the provider's send call. */
export class NotSentError extends Error {
  readonly notSent = true as const;
  constructor(message: string) {
    super(message);
    this.name = "NotSentError";
  }
}

/** True when a failed send can't have delivered anything (safe to try again later). */
export function certainlyNotSent(err: unknown): boolean {
  if ((err as { notSent?: unknown } | null)?.notSent === true) return true;
  return isClearRejection((err as Error | null)?.message || String(err ?? ""));
}

/** Run a promise with a time limit (the work itself keeps running; we just stop waiting). */
export function withTimeout<T>(work: Promise<T>, ms: number, label = "step"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} took longer than ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}
