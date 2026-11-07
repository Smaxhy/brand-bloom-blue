import { beforeEach, describe, expect, it, vi } from "vitest";

const ghl = vi.hoisted(() => ({
  ghlToken: vi.fn(async () => "tok"),
  ghlMessages: vi.fn(async () => [] as unknown[]),
  ghlUpsertContact: vi.fn(),
  ghlSendEmail: vi.fn(),
  ghlPlainText: (s: string) => s,
}));
vi.mock("./ghl", () => ghl);
const gmailThread = vi.hoisted(() => vi.fn(async (_t?: string, _id?: string) => [] as unknown[] | null));
const gmailList = vi.hoisted(() => vi.fn(async () => ({ items: [] as { id: string; threadId: string }[], more: false })));
const gmailHeaders = vi.hoisted(() => vi.fn(async () => null as unknown));
vi.mock("./gmail", async (orig) => ({
  ...(await orig<typeof import("./gmail")>()),
  gmailThreadHeaders: gmailThread,
  gmailListAll: gmailList,
  gmailGetHeaders: gmailHeaders,
}));
vi.mock("./google-oauth", () => ({ accessTokenFor: vi.fn(async () => "gtok") }));

import { threadState } from "./channel";

const db = { one: vi.fn(async () => ({ ghl_api_key: "k", ghl_location_id: "loc", ghl_company_id: null })) } as never;
const ghlBox = { id: "mb", email: "me@agency.com", display_name: "Me", provider: "ghl" };
const gBox = { id: "mb", email: "me@agency.com", display_name: "Me", provider: "google" };
const since = Date.parse("2026-11-01T00:00:00Z");

beforeEach(() => {
  ghl.ghlMessages.mockReset();
  gmailThread.mockReset();
  gmailList.mockReset();
  gmailList.mockImplementation(async () => ({ items: [], more: false }));
  gmailHeaders.mockReset();
});

describe("checking a follow-up's conversation", () => {
  it("GoHighLevel: a real reply counts, an out-of-office or an old message doesn't", async () => {
    ghl.ghlMessages.mockResolvedValueOnce([
      { id: "1", direction: "inbound", dateAdded: "2026-10-20T10:00:00Z", body: "old thread", subject: "" },
      { id: "2", direction: "inbound", dateAdded: "2026-11-03T10:00:00Z", body: "I am out of the office until Monday", subject: "Automatic reply" },
    ]);
    expect(await threadState({}, db, ghlBox, "conv", since)).toEqual({});
    ghl.ghlMessages.mockResolvedValueOnce([
      { id: "3", direction: "inbound", dateAdded: "2026-11-04T10:00:00Z", body: "Please remove me from your list", subject: "Re: hi" },
    ]);
    const s = await threadState({}, db, ghlBox, "conv", since);
    expect(s.replied?.stop).toBe(true);
  });
  it("GoHighLevel: a bounced email in the conversation is seen; a deleted conversation is reported as gone", async () => {
    ghl.ghlMessages.mockResolvedValueOnce([{ id: "4", direction: "outbound", dateAdded: "2026-11-02T10:00:00Z", status: "bounced" }]);
    expect((await threadState({}, db, ghlBox, "conv", since)).bounced).toMatch(/bounced/);
    ghl.ghlMessages.mockRejectedValueOnce(new Error("GHL messages 404: not found"));
    expect(await threadState({}, db, ghlBox, "conv", since)).toEqual({ missing: true });
    ghl.ghlMessages.mockRejectedValueOnce(new Error("GHL messages 503: busy"));
    await expect(threadState({}, db, ghlBox, "conv", since)).rejects.toThrow(/503/);
  });
  it("Gmail: our own messages don't count, someone else's reply does", async () => {
    const base = { id: "x", threadId: "t", inReplyTo: "", references: "", failedRecipients: "", autoSubmitted: "", labelIds: [] as string[] };
    gmailThread.mockResolvedValueOnce([
      { ...base, from: "Me <me@agency.com>", subject: "Hello", snippet: "our email", internalDate: Date.parse("2026-11-02T10:00:00Z"), labelIds: ["SENT"] },
      { ...base, from: "Bob <bob@biz.com>", subject: "Re: Hello", snippet: "Yes let's talk", internalDate: Date.parse("2026-11-03T10:00:00Z") },
    ]);
    const s = await threadState({}, db, gBox, "t", since);
    expect(s.replied?.text).toBe("Yes let's talk");
    expect(s.replied?.stop).toBe(false);
  });
  it("Gmail: a delay notice is not a bounce", async () => {
    const base = { id: "d", threadId: "t", inReplyTo: "", references: "", failedRecipients: "", autoSubmitted: "", labelIds: [] as string[] };
    gmailThread.mockResolvedValueOnce([
      { ...base, from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", subject: "Delivery Status Notification (Delay)", snippet: "Message temporarily deferred, will retry", internalDate: Date.parse("2026-11-03T10:00:00Z") },
    ]);
    expect((await threadState({}, db, gBox, "t", since)).bounced).toBeUndefined();
  });
  it("Gmail: a reply with a new subject (a new conversation) is still found", async () => {
    gmailThread.mockResolvedValueOnce([]);
    gmailList.mockResolvedValueOnce({ items: [{ id: "n1", threadId: "other" }], more: false });
    gmailHeaders.mockResolvedValueOnce({ id: "n1", threadId: "other", from: "Bob <bob@biz.com>", subject: "Remove me", snippet: "please remove me from your list", internalDate: Date.parse("2026-11-04T10:00:00Z"), inReplyTo: "", references: "", failedRecipients: "", autoSubmitted: "", labelIds: ["INBOX"] });
    const s = await threadState({}, db, gBox, "t", since, "bob@biz.com");
    expect(s.replied?.stop).toBe(true);
    expect(String((gmailList.mock.calls[0] as unknown[])[1])).toMatch(/^in:anywhere from:bob@biz\.com after:\d+$/);
  });
  it("Gmail: a deleted thread is reported, and the person's own mail is still searched", async () => {
    gmailThread.mockResolvedValueOnce(null);
    expect(await threadState({}, db, gBox, "t", since, "bob@biz.com")).toEqual({ missing: true });
    expect(gmailList).toHaveBeenCalledTimes(1);
  });
});
