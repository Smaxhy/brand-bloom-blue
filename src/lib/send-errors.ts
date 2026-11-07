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
