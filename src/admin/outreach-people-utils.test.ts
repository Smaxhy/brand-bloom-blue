import { describe, expect, it } from "vitest";
import { csvCell } from "./outreach-people-utils";

describe("People CSV export", () => {
  it("quotes commas, quotes and newlines without losing the values", () => {
    expect(csvCell('A, "B"\nC')).toBe('"A, ""B""\nC"');
  });
  it("prevents lead fields from running spreadsheet formulas", () => {
    expect(csvCell('=HYPERLINK("https://example.com")')).toBe('"\'=HYPERLINK(""https://example.com"")"');
    expect(csvCell(" +123")).toBe('"\' +123"');
    expect(csvCell("person@example.com")).toBe('"person@example.com"');
  });
});