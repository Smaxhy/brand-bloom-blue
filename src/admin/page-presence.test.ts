import { describe, expect, it } from "vitest";
import { pageAway, pollBudgetMs, pollWhilePresent, waitUntilBack } from "./page-presence";

/** A fake clock: sleeping just moves time forward. */
function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => void (t += ms),
    advance: (ms: number) => void (t += ms),
  };
}

describe("polling an outside scraper", () => {
  it("gives a big request more time, capped at 30 minutes", () => {
    expect(pollBudgetMs(8 * 60_000, 100)).toBe(8 * 60_000);
    expect(pollBudgetMs(8 * 60_000, 2000)).toBe(1_000_000);
    expect(pollBudgetMs(8 * 60_000, 100_000)).toBe(30 * 60_000);
  });

  it("returns as soon as the job is done", async () => {
    const c = clock();
    let calls = 0;
    const out = await pollWhilePresent({
      initial: { done: false, n: 0 },
      check: async () => ({ done: ++calls === 3, n: calls }),
      everyMs: 6000,
      budgetMs: 60_000,
      sleep: c.sleep,
      now: c.now,
      away: () => false,
    });
    expect(out).toEqual({ result: { done: true, n: 3 }, timedOut: false });
  });

  it("doesn't use up the time budget while the tab is away", async () => {
    const c = clock();
    let calls = 0;
    // Away for the first 20 checks (2 minutes of polling), then present.
    const out = await pollWhilePresent({
      initial: { done: false },
      check: async () => ({ done: ++calls === 25 }),
      everyMs: 6000,
      budgetMs: 60_000,
      sleep: c.sleep,
      now: c.now,
      away: () => calls < 20,
    });
    expect(out.timedOut).toBe(false);
    expect(calls).toBe(25);
  });

  it("keeps going through failed checks while away, gives up after repeated failures while present", async () => {
    const c = clock();
    let calls = 0;
    const away = await pollWhilePresent<{ done: boolean }>({
      initial: { done: false },
      check: async () => {
        if (++calls < 10) throw new Error("Failed to fetch");
        return { done: true };
      },
      everyMs: 6000,
      budgetMs: 600_000,
      sleep: c.sleep,
      now: c.now,
      away: () => true,
    });
    expect(away.result.done).toBe(true);

    calls = 0;
    const present = await pollWhilePresent({
      initial: { done: false },
      check: async () => {
        calls++;
        throw new Error("server error");
      },
      everyMs: 6000,
      budgetMs: 600_000,
      maxFailures: 5,
      sleep: c.sleep,
      now: c.now,
      away: () => false,
    });
    expect(present).toMatchObject({ timedOut: false, error: "server error" });
    expect(calls).toBe(5);
  });

  it("times out after the budget of present time", async () => {
    const c = clock();
    const out = await pollWhilePresent({
      initial: { done: false },
      check: async () => ({ done: false }),
      everyMs: 6000,
      budgetMs: 60_000,
      sleep: c.sleep,
      now: c.now,
      away: () => false,
    });
    expect(out.timedOut).toBe(true);
    expect(c.now()).toBe(60_000);
  });
});

describe("tab presence", () => {
  function fakeEnv(state: { visible: boolean; online: boolean }) {
    const listeners = new Map<string, Set<() => void>>();
    const on = (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(fn);
    };
    const off = (type: string, fn: () => void) => listeners.get(type)?.delete(fn);
    const fire = (type: string) => listeners.get(type)?.forEach((fn) => fn());
    const doc = {
      get visibilityState() {
        return state.visible ? "visible" : "hidden";
      },
      addEventListener: on,
      removeEventListener: off,
    } as unknown as Document;
    const nav = {
      get onLine() {
        return state.online;
      },
    } as Navigator;
    let pending: (() => void) | null = null;
    const win = {
      addEventListener: on,
      removeEventListener: off,
      setTimeout: (fn: () => void) => {
        pending = fn;
        return 1;
      },
      clearTimeout: () => {
        pending = null;
      },
    } as unknown as Window;
    return { doc, nav, win, fire, listeners, expire: () => pending?.() };
  }

  it("is away when hidden or offline", () => {
    const s = { visible: true, online: true };
    const e = fakeEnv(s);
    expect(pageAway(e.doc, e.nav)).toBe(false);
    s.visible = false;
    expect(pageAway(e.doc, e.nav)).toBe(true);
    s.visible = true;
    s.online = false;
    expect(pageAway(e.doc, e.nav)).toBe(true);
  });

  it("waits until the tab is visible again and cleans up its listeners", async () => {
    const s = { visible: false, online: true };
    const e = fakeEnv(s);
    let resolved = false;
    const waiting = waitUntilBack(60_000, e).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    s.visible = true;
    e.fire("visibilitychange");
    await waiting;
    expect(resolved).toBe(true);
    expect([...e.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });

  it("stops waiting after the maximum even if still away", async () => {
    const e = fakeEnv({ visible: false, online: true });
    const waiting = waitUntilBack(60_000, e);
    e.expire();
    await expect(waiting).resolves.toBeUndefined();
  });
});
