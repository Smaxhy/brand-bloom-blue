import { describe, expect, it } from "vitest";
import { acquireLease, releaseLease, renewLease } from "./lease";
import { certainlyNotSent, isClearRejection, isMailboxAuthError, isPermanentMailboxError, isRateLimited, isRecipientRefusal, NotSentError, withTimeout } from "./send-errors";

/** rate_limits table stand-in honouring the two filters the lease uses. */
function leaseDb() {
  const rows: { key: string; window_start: string; count: number }[] = [];
  const pick = (q: string) => {
    const key = decodeURIComponent(/key=eq\.([^&]+)/.exec(q)?.[1] ?? "");
    const before = /window_start=lt\.([^&]+)/.exec(q)?.[1];
    const token = /count=eq\.(\d+)/.exec(q)?.[1];
    return rows.filter((r) => r.key === key
      && (!before || Date.parse(r.window_start) < Date.parse(decodeURIComponent(before)))
      && (!token || r.count === Number(token)));
  };
  return {
    rows,
    async update(_t: string, q: string, patch: Record<string, unknown>) {
      const hit = pick(q);
      hit.forEach((r) => Object.assign(r, patch));
      return hit.map((r) => ({ key: r.key }));
    },
    async insertIgnore(_t: string, row: Record<string, unknown>) {
      if (rows.some((r) => r.key === row.key)) return [];
      rows.push(row as (typeof rows)[number]);
      return [{ key: row.key }];
    },
  };
}

describe("send leases", () => {
  it("lets exactly one runner hold a mailbox until it is released or expires", async () => {
    const db = leaseDb();
    const a = await acquireLease(db as never, "send:mb", 60_000);
    expect(a).not.toBeNull();
    expect(await acquireLease(db as never, "send:mb", 60_000)).toBeNull();
    await releaseLease(db as never, a);
    const b = await acquireLease(db as never, "send:mb", 60_000);
    expect(b).not.toBeNull();
    // the old holder can no longer renew
    expect(await renewLease(db as never, a!, 60_000)).toBe(false);
    expect(await renewLease(db as never, b!, 60_000)).toBe(true);
  });
  it("takes over a lease whose holder died", async () => {
    const db = leaseDb();
    db.rows.push({ key: "lease:send:mb", window_start: new Date(Date.now() - 1000).toISOString(), count: 5 });
    expect(await acquireLease(db as never, "send:mb", 60_000)).not.toBeNull();
  });
});

describe("send error classification", () => {
  it("only treats connection failures as mailbox-wide", () => {
    expect(isMailboxAuthError("GHL send 401: Invalid JWT")).toBe(true);
    expect(isMailboxAuthError("gmail send 403: insufficient permissions")).toBe(true);
    expect(isMailboxAuthError("token refresh failed: invalid_grant")).toBe(true);
    expect(isMailboxAuthError("GHL send 422: contact 40312 is DND")).toBe(false);
    expect(isMailboxAuthError("GHL upsert 400: phone +1 403 555 0101 invalid")).toBe(false);
    expect(isPermanentMailboxError("token refresh failed: invalid_grant")).toBe(true);
    expect(isPermanentMailboxError("GHL send 401: Invalid JWT")).toBe(false);
  });
  it("only calls a failed send 'not sent' when it clearly wasn't", () => {
    expect(isClearRejection("GHL send 422: contact is DND")).toBe(true);
    expect(isClearRejection("gmail send 400: Invalid To header")).toBe(true);
    expect(isClearRejection("GHL send 429: too many requests")).toBe(true);
    expect(isClearRejection("GHL upsert 503: busy")).toBe(true); // before the send call
    expect(isClearRejection("token refresh failed: invalid_grant")).toBe(true);
    expect(isClearRejection("GHL send 502: Bad Gateway")).toBe(false);
    expect(isClearRejection("gmail send 500: backend error")).toBe(false);
    expect(isClearRejection("The operation was aborted due to timeout")).toBe(false);
    expect(isClearRejection("Network connection lost.")).toBe(false);
    expect(certainlyNotSent(new NotSentError("Network connection lost."))).toBe(true);
    expect(certainlyNotSent(new Error("Network connection lost."))).toBe(false);
    expect(isRateLimited("GHL send 429: Too many requests")).toBe(true);
    expect(isRateLimited("GHL send 422: contact 429 is DND")).toBe(false);
    // Gmail says "sending limit" with a 403: back off, don't call the login broken
    const limit = 'gmail send 403: {"error":{"errors":[{"reason":"dailyLimitExceeded"}]}}';
    expect(isRateLimited(limit)).toBe(true);
    expect(isMailboxAuthError(limit)).toBe(false);
    expect(isRecipientRefusal("GHL send 422: contact is DND")).toBe(true);
    expect(isRecipientRefusal("GHL upsert 400: invalid phone")).toBe(true);
    expect(isRecipientRefusal("GHL send 401: Invalid JWT")).toBe(false);
    expect(isRecipientRefusal("GHL send 429: slow down")).toBe(false);
    expect(isRecipientRefusal("GHL upsert 503: busy")).toBe(false);
  });
  it("stops waiting for slow work", async () => {
    await expect(withTimeout(new Promise(() => {}), 10, "website")).rejects.toThrow("website took longer");
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  });
});
