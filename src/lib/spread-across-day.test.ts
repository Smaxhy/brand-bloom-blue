import { describe, expect, it } from "vitest";
import { dripGapSeconds, effectiveGapSeconds } from "./dispatch-pacing";

describe("spread across the day", () => {
  it("spreads a 40/day cap over 24 hours to one email every 36 minutes", () => {
    expect(dripGapSeconds(0, 24, 40)).toBe(2160);
  });
  it("spreads 40 over 09:00-17:00 to one every 12 minutes", () => {
    expect(dripGapSeconds(9, 17, 40)).toBe(720);
  });
  it("never sends faster than the drip rate", () => {
    expect(effectiveGapSeconds({ seqMin: 45, seqMax: 180, windowStartHour: 9, windowEndHour: 17, dailyCap: 40 }, () => 0)).toBeGreaterThanOrEqual(612);
  });
});
