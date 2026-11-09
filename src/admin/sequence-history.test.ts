import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { table: string; ops: [string, unknown[]][] };
const mocks = vi.hoisted(() => ({
  calls: [] as Call[],
  rows: {} as Record<string, (ops: [string, unknown[]][]) => unknown[]>,
  rpc: vi.fn(),
}));
vi.mock("./store", () => ({ authFetch: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: (table: string) => {
      const call: Call = { table, ops: [] };
      mocks.calls.push(call);
      // `tbl()` is awaited, so only the chained query (not the table handle) is thenable.
      const ops = [
        "select",
        "eq",
        "in",
        "like",
        "gte",
        "limit",
        "range",
        "order",
        "delete",
        "update",
        "neq",
      ];
      const q: Record<string, unknown> = {
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: (mocks.rows[table] ?? (() => []))(call.ops), error: null }),
      };
      const handle: Record<string, unknown> = {};
      for (const op of ops) {
        q[op] = handle[op] = (...args: unknown[]) => {
          call.ops.push([op, args]);
          return q;
        };
      }
      return handle;
    },
  },
}));
import { deleteSequence, liveEnrolledEmails, RECONTACT_COOLDOWN_DAYS } from "./outreach";

const has = (ops: [string, unknown[]][], op: string, ...args: unknown[]) =>
  ops.some(([o, a]) => o === op && JSON.stringify(a) === JSON.stringify(args));

beforeEach(() => {
  mocks.calls = [];
  mocks.rows = {};
  mocks.rpc.mockReset();
});

describe("deleting a sequence keeps its history", () => {
  it("archives through the database function and never hard-deletes", async () => {
    mocks.rpc.mockResolvedValue({ data: 3, error: null });
    await deleteSequence("seq-1");
    expect(mocks.rpc).toHaveBeenCalledWith("delete_sequence_keep_history", {
      _sequence_id: "seq-1",
    });
    expect(mocks.calls.some((c) => c.ops.some(([op]) => op === "delete"))).toBe(false);
  });

  it("refuses with a clear message when the database update is missing, without deleting", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.delete_sequence_keep_history",
      },
    });
    await expect(deleteSequence("seq-1")).rejects.toThrow(
      /hasn't been applied yet — nothing was deleted/,
    );
    expect(mocks.calls).toHaveLength(0);
  });
});

describe("people who can't be added to another sequence", () => {
  it("includes sent addresses beyond the first history page", async () => {
    mocks.rows.messages = (ops) => has(ops, "range", 0, 499)
      ? Array.from({ length: 500 }, (_, i) => ({ leads: { email: `person${i}@biz.com` } }))
      : [{ leads: { email: "later-page@biz.com" } }];
    const blocked = await liveEnrolledEmails();
    expect(blocked.size).toBe(501);
    expect(blocked.has("later-page@biz.com")).toBe(true);
  });
  it("includes running, possibly-sent and recently emailed people (also from deleted sequences)", async () => {
    mocks.rows.enrollments = (ops) =>
      has(ops, "in", "status", ["queued", "active", "paused"])
        ? [{ leads: { email: "Running@Biz.com" } }]
        : has(ops, "like", "last_error", "Possibly sent%")
          ? [{ leads: { email: "held@biz.com" } }]
          : [];
    mocks.rows.messages = () => [
      { leads: { email: "from-deleted-sequence@biz.com" } },
      { leads: null },
    ];
    const blocked = await liveEnrolledEmails();
    expect([...blocked].sort()).toEqual([
      "from-deleted-sequence@biz.com",
      "held@biz.com",
      "running@biz.com",
    ]);

    const msgs = mocks.calls.find((c) => c.table === "messages");
    if (!msgs) throw new Error("Missing message history query");
    expect(has(msgs.ops, "eq", "direction", "out")).toBe(true);
    expect(has(msgs.ops, "in", "status", ["sent", "bounced"])).toBe(true);
    const since = msgs.ops.find(([op]) => op === "gte")?.[1][1] as string;
    const days = (Date.now() - Date.parse(since)) / 86_400_000;
    expect(Math.round(days)).toBe(RECONTACT_COOLDOWN_DAYS);
  });
});
