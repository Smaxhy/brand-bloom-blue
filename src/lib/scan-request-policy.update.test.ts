import { describe, expect, it } from "vitest";
import { scanRequestLimit } from "./scan-request-policy";

describe("scan request protection", () => {
  it("keeps all five action counters independent so polling cannot exhaust Start or Stop", () => {
    const limits = (["start", "step", "status", "cancel", "list"] as const).map((action) => scanRequestLimit(action, "owner"));
    expect(new Set(limits.map((limit) => limit._key)).size).toBe(5);
    expect(limits.map((limit) => limit._max)).toEqual([3, 30, 30, 30, 30]);
    expect(limits.every((limit) => limit._window_seconds === 60)).toBe(true);
    expect(scanRequestLimit("step", "other")._key).not.toBe(scanRequestLimit("step", "owner")._key);
  });
});