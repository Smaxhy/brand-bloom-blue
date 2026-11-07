import { afterEach, describe, expect, it, vi } from "vitest";
import { addSuppression, applyHardBounce, applySoftBounce, isInvalidRecipientError, looksLikeEmail, normalizeEmail, preSendCheck, verifyEmail } from "./bounce";
import type { Db } from "./db";

afterEach(() => vi.unstubAllGlobals());

describe("address protection", () => {
  it("normalizes scraped mailbox addresses", () => {
    expect(normalizeEmail(" mailto:Owner@Example.COM); ")).toBe("owner@example.com");
  });
  it("rejects malformed addresses even when previously verified", async () => {
    const result = await preSendCheck({}, {} as Db, { id: "lead", email: "bad..name@example.com", email_verified: "valid" });
    expect(result.ok).toBe(false);
    expect(looksLikeEmail("owner@example.com")).toBe(true);
  });
  it("does not spend verification calls on malformed emails", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyEmail({ REOON_API_KEY: "test" }, "not-an-email")).toBe("invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("distinguishes invalid recipients from mailbox authentication and rate errors", () => {
    expect(isInvalidRecipientError("CONVERSATIONS_MSG_INVALID_EMAIL")).toBe(true);
    expect(isInvalidRecipientError("Invalid To header")).toBe(true);
    expect(isInvalidRecipientError("401 invalid_grant")).toBe(false);
    expect(isInvalidRecipientError("429 Too Many Requests")).toBe(false);
  });
  it("inbox sync can insist that a hard bounce was really applied", async () => {
    const failing = {
      one: vi.fn(async () => null),
      insert: vi.fn(async () => { throw new Error("db insert suppressions: 503"); }),
      update: vi.fn(async () => []),
    } as unknown as Db;
    const p = { email: "gone@example.com", lead: { id: "lead-1", domain: "example.com" }, enrollmentId: "en-1", reason: "bounce" as const, note: "550 no such user" };
    await expect(applyHardBounce(failing, p)).resolves.toBeUndefined(); // pre-send use: best effort
    await expect(applyHardBounce(failing, { ...p, strict: true })).rejects.toThrow(/suppressions/);
  });
  it("saves a suppression without an upsert (the table's unique index can't be targeted)", async () => {
    const rows: Record<string, unknown>[] = [];
    const db = {
      one: vi.fn(async (_t: string, q: string) => rows.find((r) => q.includes(`email=eq.${encodeURIComponent(String(r.email))}`)) ?? null),
      insert: vi.fn(async (_t: string, row: Record<string, unknown>) => { rows.push({ id: `s${rows.length}`, ...row }); return [row]; }),
      update: vi.fn(async (_t: string, _q: string, patch: Record<string, unknown>) => { Object.assign(rows[0], patch); return []; }),
    };
    await addSuppression(db as never, { email: " Owner@Biz.com ", domain: null, reason: "unsubscribe", note: "link" });
    expect(rows).toEqual([expect.objectContaining({ email: "owner@biz.com", reason: "unsubscribe" })]);
    // listed already: nothing new, but a company domain learned later is added
    await addSuppression(db as never, { email: "owner@biz.com", domain: "biz.com", reason: "bounce" });
    expect(rows).toHaveLength(1);
    expect(rows[0].domain).toBe("biz.com");
    // added by someone else at the same moment: fine
    const racing = { one: async () => null, insert: async () => { throw new Error('db insert suppressions: 409 {"code":"23505"}'); }, update: async () => [] };
    await expect(addSuppression(racing as never, { email: "x@y.com", reason: "manual" })).resolves.toBeUndefined();
  });
  it("a soft bounce never overwrites a send in progress or pulls a later follow-up earlier", async () => {
    const update = vi.fn(async () => []);
    const later = new Date(Date.now() + 7 * 86400e3).toISOString();
    await applySoftBounce({ update } as never, { id: "en-1", last_error: null, next_send_at: later }, "mailbox full");
    const [, q, patch] = update.mock.calls[0] as unknown as [string, string, { next_send_at: string }];
    expect(q).toContain("last_error.not.like.");
    expect(patch.next_send_at).toBe(later);
  });
  it("never stores gmail.com or facebook.com as a company block", async () => {
    const inserted: Record<string, unknown>[] = [];
    const db = { one: async () => null, insert: async (_t: string, row: Record<string, unknown>) => { inserted.push(row); return [row]; }, update: async () => [] };
    await addSuppression(db as never, { email: "joe@gmail.com", domain: "gmail.com", reason: "bounce" });
    await addSuppression(db as never, { email: "x@biz.com", domain: "facebook.com", reason: "bounce" });
    await addSuppression(db as never, { email: "y@acme.com", domain: "acme.com", reason: "bounce" });
    expect(inserted.map((r) => r.domain)).toEqual([null, null, "acme.com"]);
  });
  it("a real bounce blacklists the company; a verifier rejecting one address blocks only that address", async () => {
    const inserted: Record<string, unknown>[] = [];
    const db = { one: async () => null, insert: async (_t: string, row: Record<string, unknown>) => { inserted.push(row); return [row]; }, update: async () => [] };
    const lead = { id: "l1", domain: "acme.com" };
    await applyHardBounce(db as never, { email: "info@acme.com", lead, reason: "bounce", note: "550 no such user" });
    await applyHardBounce(db as never, { email: "guess@acme.com", lead, reason: "verify_invalid", note: "pre-send check: verifier says the address is invalid" });
    await applyHardBounce(db as never, { email: "x@deadco.com", lead: { id: "l2", domain: "deadco.com" }, reason: "verify_invalid", note: "pre-send check: domain has no mail server" });
    expect(inserted.map((r) => r.domain)).toEqual(["acme.com", null, "deadco.com"]);
  });
});
