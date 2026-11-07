import { describe, expect, it } from "vitest";
import { addToRaw } from "./raw-merge";
import type { RawBusiness } from "./store";

const row = (over: Partial<RawBusiness>): RawBusiness => ({ id: "x", business: "", email: "", phone: "", website: "", city: "", industry: "", status: "raw", scrapedAt: 1, ...over });

describe("adding to Raw Data", () => {
  it("never creates a second row for a business that's already there", () => {
    const raw = [row({ id: "old", business: "Summit Roofing", website: "summitroofing.com", status: "accepted" })];
    const r = addToRaw(raw, [
      row({ id: "n1", business: "Summit Roofing LLC", website: "https://www.summitroofing.com/", email: "info@summitroofing.com", emailSource: "Website" }),
      row({ id: "n2", business: "Brand New Co", website: "brandnew.com" }),
      row({ id: "n3", business: "Brand New Co", website: "brandnew.com" }),
    ]);
    expect(r.added).toBe(1);
    expect(r.updated).toBe(1);
    expect(r.raw.map((x) => x.id)).toEqual(["n2", "old"]);
    expect(r.raw[1]).toMatchObject({ status: "accepted", email: "info@summitroofing.com" });
  });
  it("keeps businesses that only share a Facebook page host apart", () => {
    const r = addToRaw([row({ id: "a", business: "Joe's Roofing", website: "facebook.com/joes", phone: "3035550100" })], [
      row({ id: "b", business: "Mile High Gutters", website: "facebook.com/milehigh", phone: "7205550111" }),
    ]);
    expect(r.added).toBe(1);
  });
});
