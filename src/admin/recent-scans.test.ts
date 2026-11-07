import { describe, expect, it } from "vitest";
import { describeScan, timeAgo } from "./views/RecentScans";

describe("Recent scans labels", () => {
  it("shortens long keyword lists and splits out the place and count", () => {
    expect(describeScan("christmas lights, holiday lighting, light installation · Denver, CO · 96")).toEqual({ title: "Christmas lights +2", place: "Denver, CO", count: 96 });
    expect(describeScan("Raw Data · 120 businesses")).toEqual({ title: "Raw Data", place: "", count: 120 });
    expect(describeScan("scan ·  · 6")).toEqual({ title: "Scan", place: "", count: 6 });
  });
  it("says when, in plain words", () => {
    const now = Date.parse("2026-11-07T12:00:00Z");
    expect(timeAgo("2026-11-07T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-11-07T11:15:00Z", now)).toBe("45 min ago");
    expect(timeAgo("2026-11-07T07:00:00Z", now)).toBe("5 h ago");
    expect(timeAgo("2026-11-06T10:00:00Z", now)).toBe("yesterday");
  });
});
