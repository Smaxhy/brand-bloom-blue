import { afterEach, describe, expect, it, vi } from "vitest";
import { sendingStatus } from "./sending-status.server";

afterEach(() => vi.useRealTimers());

describe("sending diagnostics", () => {
  it("is read only and preserves the mailbox daily cap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
    const select = vi.fn(async (table: string) => {
      if (table === "mailboxes") return [{ id: "mb", email: "sender@example.com", status: "active", daily_cap: 2, timezone: "UTC", window_start: 0, window_end: 24, send_days: [0,1,2,3,4,5,6], last_sync_at: "2026-11-06T11:55:00Z" }];
      if (table === "sequences") return [{ id: "seq", name: "Example", status: "active", mailbox_ids: ["mb"], send_anytime: true }];
      if (table === "messages") return [{ id: "one" }, { id: "two" }];
      return [{ id: "waiting", next_send_at: "2026-11-06T11:00:00Z" }];
    });
    const result = await sendingStatus({ select } as Parameters<typeof sendingStatus>[0]);
    expect(result.mailboxes[0].daily_cap).toBe(2);
    expect(result.mailboxes[0].sent_today).toBe(2);
    expect(result.mailboxes[0].can_send_now).toBe(false);
    expect(select.mock.calls.map(([table]) => table)).toEqual(["mailboxes", "sequences", "outreach_settings", "messages", "enrollments"]);
  });
  it("only counts anytime sequences as due outside mailbox hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T23:00:00Z"));
    const select = vi.fn(async (table: string, query?: string) => {
      if (table === "mailboxes") return [{ id: "mb", email: "sender@example.com", status: "active", daily_cap: 100, timezone: "UTC", window_start: 9, window_end: 17, send_days: [5], last_sync_at: null }];
      if (table === "sequences") return [
        { id: "business", status: "active", mailbox_ids: ["mb"], send_anytime: false },
        { id: "anytime", status: "active", mailbox_ids: ["mb"], send_anytime: true },
      ];
      if (table === "enrollments" && query?.includes("sequence_id=in.(anytime)")) return [{ id: "due", next_send_at: "2026-11-06T22:00:00Z" }];
      return [];
    });
    const result = await sendingStatus({ select } as Parameters<typeof sendingStatus>[0]);
    expect(result.mailboxes[0].due_now).toBe(1);
    expect(result.mailboxes[0].can_send_now).toBe(true);
    expect(select.mock.calls.find(([table]) => table === "enrollments")?.[1]).toContain("sequence_id=in.(anytime)");
  });
  it("does not confuse a manual mailbox sync with an automatic scheduler run", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
    const select = vi.fn(async (table: string) => table === "mailboxes"
      ? [{ status: "paused", timezone: "UTC", send_days: [], window_start: 9, window_end: 17, last_sync_at: "2026-11-06T11:59:00Z" }]
      : []);
    expect((await sendingStatus({ select } as Parameters<typeof sendingStatus>[0])).scheduler.ok).toBe(false);
  });
  it("recognizes the dedicated scheduled-dispatch heartbeat", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
    const select = vi.fn(async (table: string) => table === "outreach_settings" ? [{ last_cron_at: "2026-11-06T11:50:00Z" }] : []);
    const result = await sendingStatus({ select } as Parameters<typeof sendingStatus>[0]);
    expect(result.scheduler.ok).toBe(true);
    expect(result.scheduler.last_seen).toBe("2026-11-06T11:50:00Z");
  });
});