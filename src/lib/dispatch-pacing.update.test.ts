import { describe, expect, it } from "vitest";
import { dispatchBudgetMs, fitsDispatchBudget, gapElapsed, gapWaitMs, pickGapSeconds, sendEtaMinutes } from "./dispatch-pacing";

describe("bounded email dispatch", () => {
  it("keeps request-driven runs inside the 30-second disconnect grace period", () => {
    expect(dispatchBudgetMs("manual")).toBe(25_000);
    expect(dispatchBudgetMs("tick")).toBe(25_000);
  });
  it("uses a fifty-second cron budget when the interval is unknown", () => {
    expect(dispatchBudgetMs("cron")).toBe(50_000);
    expect(dispatchBudgetMs("cron", 60_000)).toBe(50_000);
  });
  it("bounds even a delayed cron run to fifty seconds", () => {
    expect(dispatchBudgetMs("cron", 600_000)).toBe(50_000);
    expect(dispatchBudgetMs("cron", 3 * 60_000)).toBe(50_000);
    expect(dispatchBudgetMs("cron", 6 * 3600_000)).toBe(50_000);
  });
  it("leaves a long sending gap for the next run instead of sleeping beyond the budget", () => {
    expect(fitsDispatchBudget(0, 50_000, 45_000, 10_000)).toBe(false);
    expect(fitsDispatchBudget(0, 50_000, 30_000, 10_000)).toBe(true);
  });
  it("respects the configured gap since the previous email", () => {
    expect(gapElapsed(new Date(0).toISOString(), 60, 59_000)).toBe(false);
    expect(gapElapsed(new Date(0).toISOString(), 60, 60_000)).toBe(true);
    expect(gapWaitMs(new Date(0).toISOString(), 60, 45_000)).toBe(15_000);
    expect(gapWaitMs(null, 60, 45_000)).toBe(0);
    expect(gapWaitMs(0, 60, 45_000)).toBe(15_000);
  });
  it("picks gaps inside the configured range", () => {
    expect(pickGapSeconds(45, 180, () => 0)).toBe(45);
    expect(pickGapSeconds(45, 180, () => 0.9999)).toBe(180);
    expect(pickGapSeconds(180, 45, () => 0)).toBe(45);
  });
  it("estimates how long a queue takes, including days blocked by the cap", () => {
    expect(sendEtaMinutes({ waiting: 0, gapMinSec: 60, gapMaxSec: 120, dailyCap: 100, sentToday: 0 })).toEqual({ minutes: 0, days: 0 });
    expect(sendEtaMinutes({ waiting: 30, gapMinSec: 60, gapMaxSec: 120, dailyCap: 100, sentToday: 0 })).toEqual({ minutes: 45, days: 0 });
    expect(sendEtaMinutes({ waiting: 250, gapMinSec: 60, gapMaxSec: 120, dailyCap: 100, sentToday: 50 })).toEqual({ minutes: 75, days: 2 });
  });
});
