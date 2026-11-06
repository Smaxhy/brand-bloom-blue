import { describe, expect, it } from "vitest";
import { eligibleSendBatches } from "./send-batches";
describe("manual bulk sends", () => {
  it("holds future follow-ups and completed people back", () => {
    const people = [
      { id: "first", status: "queued", current_step: 0 },
      { id: "future", status: "active", current_step: 1, next_send_at: "2026-11-07T12:00:00Z" },
      { id: "due", status: "active", current_step: 1, next_send_at: "2026-11-05T12:00:00Z" },
      { id: "done", status: "completed", current_step: 0 },
    ];
    expect(eligibleSendBatches(people, Date.parse("2026-11-06T12:00:00Z"))).toEqual([["first", "due"]]);
  });
  it("sends each person once in batches of at most 20", () => {
    const people = Array.from({ length: 45 }, (_, i) => ({ id: String(i), status: "queued", current_step: 0 }));
    const first = people[0];
    const batches = eligibleSendBatches(first ? [...people, first] : people);
    expect(batches.map((batch) => batch.length)).toEqual([20, 20, 5]);
    expect(new Set(batches.flat()).size).toBe(45);
  });
});