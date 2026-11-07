import { describe, expect, it, vi } from "vitest";

const authFetch = vi.hoisted(() => vi.fn());
vi.mock("./store", () => ({ authFetch }));

import { sendAllNow } from "./outreach";

const reply = (mailboxes: unknown[], extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: true, report: { mailboxes, errors: [] }, ...extra }), { status: 200 });

describe("send everyone waiting", () => {
  it("keeps going while the sequence's mailbox still has people, ignoring other mailboxes", async () => {
    authFetch.mockReset();
    authFetch
      .mockResolvedValueOnce(reply([
        { email: "seq@x.com", sent: 3, remaining_today: 50, due_left: 4 },
        { email: "other@x.com", sent: 0, remaining_today: 0, skipped: "this mailbox isn't used by that sequence" },
      ]))
      .mockResolvedValueOnce(reply([
        { email: "seq@x.com", sent: 4, remaining_today: 46, due_left: 0 },
        { email: "other@x.com", sent: 0, remaining_today: 0, skipped: "this mailbox isn't used by that sequence" },
      ]));
    const r = await sendAllNow("seq-1");
    expect(r.rounds).toBe(2);
    expect(r.sent).toBe(7);
    expect(r.left).toBe(0);
  });
  it("stops when the daily cap is reached", async () => {
    authFetch.mockReset();
    authFetch.mockResolvedValueOnce(reply([{ email: "seq@x.com", sent: 2, remaining_today: 0, skipped: "daily cap reached" }]));
    const r = await sendAllNow("seq-1");
    expect(r.rounds).toBe(1);
    expect(r.note).toMatch(/Daily cap/);
  });
  it("stops when asked", async () => {
    authFetch.mockReset();
    let calls = 0;
    authFetch.mockImplementation(async () => { calls++; return reply([{ email: "seq@x.com", sent: 1, remaining_today: 50, due_left: 99 }]); });
    let stop = false;
    const r = await sendAllNow("seq-1", { shouldStop: () => stop, onProgress: (p) => { if (p.rounds >= 2) stop = true; } });
    expect(calls).toBe(2);
    expect(r.sent).toBe(2);
  });
  it("keeps the same group of people for the whole action", async () => {
    authFetch.mockReset();
    authFetch
      .mockResolvedValueOnce(reply([{ email: "seq@x.com", sent: 2, remaining_today: 50, due_left: 1 }], { frozen_at: "2026-11-07T10:00:00.000Z" }))
      .mockResolvedValueOnce(reply([{ email: "seq@x.com", sent: 1, remaining_today: 49, due_left: 0 }], { frozen_at: "2026-11-07T10:00:00.000Z" }));
    await sendAllNow("seq-1");
    const bodies = authFetch.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)));
    expect(bodies[0].frozenAt).toBeUndefined();
    expect(bodies[1].frozenAt).toBe("2026-11-07T10:00:00.000Z");
  });
  it("doesn't stop early while a mailbox is busy with background sending", async () => {
    authFetch.mockReset();
    authFetch
      .mockResolvedValueOnce(reply([
        { email: "a@x.com", sent: 0, remaining_today: 50, busy: true, skipped: "another sender is using this mailbox right now" },
        { email: "b@x.com", sent: 1, remaining_today: 49, due_left: 0 },
      ]))
      .mockResolvedValueOnce(reply([
        { email: "a@x.com", sent: 2, remaining_today: 48, due_left: 0 },
        { email: "b@x.com", sent: 0, remaining_today: 49, due_left: 0 },
      ]));
    const r = await sendAllNow("seq-1");
    expect(r.rounds).toBe(2);
    expect(r.sent).toBe(3);
  });
  it("a busy mailbox is not mistaken for a full one", async () => {
    vi.useFakeTimers();
    try {
      authFetch.mockReset();
      authFetch
        .mockResolvedValueOnce(reply([{ email: "a@x.com", sent: 0, remaining_today: 0, busy: true, skipped: "another sender is using this mailbox right now" }]))
        .mockResolvedValueOnce(reply([{ email: "a@x.com", sent: 3, remaining_today: 40, due_left: 0 }]));
      const running = sendAllNow("seq-1");
      await vi.advanceTimersByTimeAsync(6000); // the short wait while the mailbox is busy
      const r = await running;
      expect(r.note).not.toMatch(/Daily cap/);
      expect(r.sent).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
