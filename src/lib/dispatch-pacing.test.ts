import { describe, expect, it } from "vitest";
import { dispatchBudgetMs, fitsDispatchBudget, gapElapsed } from "./dispatch-pacing";

describe("bounded email dispatch", () => {
  it("uses a fifty-second cron budget and a 25-second manual budget", () => {
    expect(dispatchBudgetMs("cron")).toBe(50_000);
    expect(dispatchBudgetMs("manual")).toBe(25_000);
  });
  it("leaves a long sending gap for the next run instead of sleeping beyond the budget", () => {
    expect(fitsDispatchBudget(0, 50_000, 45_000, 10_000)).toBe(false);
    expect(fitsDispatchBudget(0, 50_000, 30_000, 10_000)).toBe(true);
  });
  it("respects the configured gap since the previous email", () => {
    expect(gapElapsed(new Date(0).toISOString(), 60, 59_000)).toBe(false);
    expect(gapElapsed(new Date(0).toISOString(), 60, 60_000)).toBe(true);
  });
});