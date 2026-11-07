import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: { id: "singleton", last_cron_at: null as string | null, last_tick_source: null as string | null, scheduler_token_hash: null as string | null },
  leases: [] as { key: string; window_start: string; count: number }[],
}));
vi.mock("./db", () => ({
  Db: class {
    static available() { return true; }
    async one(table: string) { return table === "outreach_settings" ? { ...state.settings } : table === "outreach_scheduler" ? { token_hash: state.settings.scheduler_token_hash } : null; }
    async update(table: string, query: string, patch: Record<string, unknown>) {
      if (table === "outreach_settings") { Object.assign(state.settings, patch); return [{ id: "singleton" }]; }
      const key = decodeURIComponent(/key=eq\.([^&]+)/.exec(query)?.[1] ?? "");
      const before = /window_start=lt\.([^&]+)/.exec(query)?.[1];
      const token = /count=eq\.(\d+)/.exec(query)?.[1];
      const hit = state.leases.filter((l) => l.key === key && (!before || Date.parse(l.window_start) < Date.parse(decodeURIComponent(before))) && (!token || l.count === Number(token)));
      hit.forEach((l) => Object.assign(l, patch));
      return hit;
    }
    async insertIgnore(_t: string, row: { key: string; window_start: string; count: number }) {
      if (state.leases.some((l) => l.key === row.key)) return [];
      state.leases.push({ ...row });
      return [row];
    }
  },
  enc: encodeURIComponent,
}));
const runDispatch = vi.hoisted(() => vi.fn(async () => ({ ran_at: "", mailboxes: [{ email: "a", sent: 2, remaining_today: 5 }], errors: [] })));
vi.mock("./sequencer", () => ({ runDispatch }));
const continueScanJobs = vi.hoisted(() => vi.fn(async () => ({ jobs: 1, read: 6, finished: 0 })));
vi.mock("./scan-jobs.server", () => ({ continueScanJobs }));
const runDueSavedSearches = vi.hoisted(() => vi.fn(async () => ({ ran: [], errors: [] })));
vi.mock("./saved-searches", () => ({ runDueSavedSearches }));

import { runTick, sha256Hex, verifySchedulerToken, forgetSchedulerTokenCache } from "./tick";

beforeEach(() => {
  state.settings = { id: "singleton", last_cron_at: null, last_tick_source: null, scheduler_token_hash: null };
  state.leases = [];
  runDispatch.mockClear();
  continueScanJobs.mockClear();
  runDueSavedSearches.mockClear();
});

describe("background ticks", () => {
  it("a server tick stamps the heartbeat, sends and reads websites", async () => {
    const r = await runTick({}, { trigger: "db" });
    expect(state.settings.last_cron_at).toBeTruthy();
    expect(state.settings.last_tick_source).toBe("db");
    expect(runDispatch).toHaveBeenCalledWith({}, expect.objectContaining({ source: "tick", budgetMs: 25_000 }));
    expect(continueScanJobs).toHaveBeenCalled();
    expect(r.dispatch?.mailboxes[0].sent).toBe(2);
  });
  it("an open tab does nothing while a real scheduler is running", async () => {
    state.settings.last_cron_at = new Date(Date.now() - 30_000).toISOString();
    const r = await runTick({}, { trigger: "browser" });
    expect(runDispatch).not.toHaveBeenCalled();
    expect(r.dispatch_skipped).toMatch(/scheduler is running/);
  });
  it("an open tab keeps things moving when no scheduler ran, without faking the heartbeat", async () => {
    state.settings.last_cron_at = new Date(Date.now() - 10 * 60_000).toISOString();
    const before = state.settings.last_cron_at;
    await runTick({}, { trigger: "browser" });
    expect(runDispatch).toHaveBeenCalled();
    expect(state.settings.last_cron_at).toBe(before);
    expect(runDueSavedSearches).not.toHaveBeenCalled();
  });
  it("never runs two automatic dispatchers at once", async () => {
    state.leases.push({ key: "lease:dispatch:auto", window_start: new Date(Date.now() + 30_000).toISOString(), count: 9 });
    const r = await runTick({}, { trigger: "cron" });
    expect(runDispatch).not.toHaveBeenCalled();
    expect(r.dispatch_skipped).toMatch(/already sending/);
    expect(continueScanJobs).toHaveBeenCalled();
  });
  it("keeps delayed cron runs bounded", async () => {
    state.settings.last_cron_at = new Date(Date.now() - 10 * 60_000).toISOString();
    await runTick({}, { trigger: "cron" });
    const call = runDispatch.mock.calls[0] as unknown as [unknown, { budgetMs: number }];
    expect(call[1].budgetMs).toBe(50_000);
  });
});

describe("database timer token", () => {
  it("accepts only the token whose hash is stored", async () => {
    const token = "ab".repeat(32);
    state.settings.scheduler_token_hash = await sha256Hex(token);
    forgetSchedulerTokenCache();
    expect(await verifySchedulerToken({}, token)).toBe(true);
    expect(await verifySchedulerToken({}, "cd".repeat(32))).toBe(false);
    expect(await verifySchedulerToken({}, "short")).toBe(false);
    expect(await verifySchedulerToken({}, null)).toBe(false);
    state.settings.scheduler_token_hash = null;
    expect(await verifySchedulerToken({}, token)).toBe(false);
  });
});
