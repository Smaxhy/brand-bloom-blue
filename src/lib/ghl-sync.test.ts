import { beforeEach, describe, expect, it, vi } from "vitest";

const ghl = vi.hoisted(() => ({
  ghlToken: vi.fn(async () => "token"),
  ghlInboundConversations: vi.fn(async () => [] as unknown[]),
  ghlMessages: vi.fn(async () => [] as unknown[]),
  ghlEmail: vi.fn(async () => ({ status: "bounced" }) as unknown),
  ghlPlainText: (s: string) => s,
  GHL_BOUNCE_STATUSES: new Set(["bounced", "failed", "undelivered"]),
}));
vi.mock("./ghl", () => ghl);
vi.mock("./channel", () => ({ ghlCredsFor: vi.fn(async () => ({ apiKey: "k", locationId: "loc" })) }));
vi.mock("./reply-ai", () => ({ classifyReply: vi.fn() }));
const applyHardBounce = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("./bounce", () => ({ applyHardBounce }));

import { syncGhlMailbox } from "./ghl-sync";

type Row = Record<string, unknown>;
function fakeDb(sent: Row[]) {
  const calls: { op: string; table: string; q?: string; patch?: Row }[] = [];
  return {
    calls,
    async select(table: string, q: string) {
      calls.push({ op: "select", table, q });
      if (table !== "messages") return [];
      const from = Date.parse(decodeURIComponent(/sent_at=gte\.([^&]+)/.exec(q)?.[1] ?? ""));
      const to = Date.parse(decodeURIComponent(/sent_at=lte\.([^&]+)/.exec(q)?.[1] ?? ""));
      return sent.filter((r) => Date.parse(String(r.sent_at)) >= from && Date.parse(String(r.sent_at)) <= to);
    },
    async one(table: string, q: string) {
      calls.push({ op: "one", table, q });
      return table === "leads" ? { id: "lead-1", email: "gone@biz.com", domain: "biz.com" } : null;
    },
    async update(table: string, q: string, patch: Row) {
      calls.push({ op: "update", table, q, patch });
      return [];
    },
    async insert(table: string, patch: Row) {
      calls.push({ op: "insert", table, patch });
      return [];
    },
    async upsert(table: string, patch: Row) {
      calls.push({ op: "upsert", table, patch });
      return [];
    },
  };
}
const minAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const mb = { id: "mb-1", email: "sender@x.com", display_name: "S", provider: "ghl" } as never;

beforeEach(() => {
  applyHardBounce.mockReset();
  applyHardBounce.mockImplementation(async () => {});
  ghl.ghlEmail.mockClear();
});

describe("GoHighLevel bounce checks", () => {
  it("only asks GHL about emails sent ~10–20 min or ~6 h ago", async () => {
    const db = fakeDb([
      { id: "a", gmail_message_id: "e-a", enrollment_id: "en-a", lead_id: "lead-1", subject: "Hi", sent_at: minAgo(15) },
      { id: "b", gmail_message_id: "e-b", enrollment_id: "en-b", lead_id: "lead-1", subject: "Hi", sent_at: minAgo(30) },
      { id: "c", gmail_message_id: "e-c", enrollment_id: "en-c", lead_id: "lead-1", subject: "Hi", sent_at: minAgo(365) },
    ]);
    const out = await syncGhlMailbox({}, db as never, mb);
    expect(ghl.ghlEmail.mock.calls.map((c) => (c as unknown[])[1])).toEqual(["e-a", "e-c"]);
    expect(out.bounces).toBe(2);
    expect(applyHardBounce.mock.calls.every((c) => (c as unknown[])[1] && ((c as unknown[])[1] as { strict?: boolean }).strict)).toBe(true);
    expect(db.calls.some((c) => c.op === "update" && c.table === "mailboxes")).toBe(true);
  });

  it("a bounce that couldn't be applied is not recorded as handled", async () => {
    const db = fakeDb([{ id: "a", gmail_message_id: "e-a", enrollment_id: "en-a", lead_id: "lead-1", subject: "Hi", sent_at: minAgo(12) }]);
    applyHardBounce.mockRejectedValueOnce(new Error("db upsert suppressions: 503"));
    await expect(syncGhlMailbox({}, db as never, mb)).rejects.toThrow(/suppressions/);
    // the email stays "sent" (checked again next sync) and the inbox read doesn't count as complete
    expect(db.calls.some((c) => c.op === "update" && c.table === "messages")).toBe(false);
    expect(db.calls.some((c) => c.op === "update" && c.table === "mailboxes")).toBe(false);
  });
});
