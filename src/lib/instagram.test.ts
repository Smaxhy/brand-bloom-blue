import { describe, it, expect } from "vitest";
import { pickInstagram } from "./api-proxies";
import { igDmText, igDmsToday, igHandleOf, IG_DM_VARIANTS, logIgDm, rowsFromScan, type AdminData, type ScanJobFull } from "../admin/store";
import { addToRaw } from "../admin/raw-merge";
import { mergeRawReveal, rawScanPerson } from "../admin/raw-reveal";

describe("pickInstagram", () => {
  it("returns the first real profile handle from a search blob", () => {
    expect(
      pickInstagram('[{"link":"https://www.instagram.com/p/XYZ123/"},{"link":"https://www.instagram.com/joes.roofing/"}]'),
    ).toBe("https://www.instagram.com/joes.roofing");
  });
  it("skips posts, reels and section pages, not just the first hit", () => {
    expect(pickInstagram("https://www.instagram.com/explore/tags/roofing/")).toBe("");
    expect(pickInstagram("https://instagram.com/reel/abc/ then https://instagram.com/realbiz")).toBe(
      "https://www.instagram.com/realbiz",
    );
  });
  it("returns empty when there is no Instagram link", () => {
    expect(pickInstagram("just some text with facebook.com/x and a phone")).toBe("");
  });
});

describe("igDmText", () => {
  it("greets by first name and names the business, with no links", () => {
    const msg = igDmText({ company: "Joe's Roofing", name: "Joe Smith", city: "Denver", industry: "Roofing" });
    expect(msg).toContain("Hey Joe");
    expect(msg).toContain("Joe's Roofing");
    expect(msg).toContain("in Denver");
    expect(msg).not.toMatch(/https?:\/\//); // cold DMs with links get flagged
  });
  it("still reads naturally with no name, city or industry", () => {
    const msg = igDmText({ company: "" });
    expect(msg.startsWith("Hey!")).toBe(true);
    expect(msg).toContain("your business");
    expect(msg).toContain("local businesses");
  });
});

describe("the manual DM workflow", () => {
  const who = { company: "Joe's Roofing", name: "Joe Smith", city: "Denver, CO", industry: "Roofing" };
  it("rotates between several different openers, none with a link", () => {
    const all = Array.from({ length: IG_DM_VARIANTS }, (_, i) => igDmText(who, i));
    expect(new Set(all).size).toBe(IG_DM_VARIANTS);
    expect(IG_DM_VARIANTS).toBeGreaterThanOrEqual(4);
    for (const msg of all) {
      expect(msg.startsWith("Hey Joe!")).toBe(true);
      expect(msg).toContain("Joe's Roofing");
      expect(msg).toContain("Denver"); // the town, not "Denver, CO"
      expect(msg).not.toContain("Denver, CO");
      expect(msg).not.toMatch(/https?:\/\/|www\./);
      expect(msg.length).toBeLessThan(320);
    }
    // wraps around instead of failing
    expect(igDmText(who, IG_DM_VARIANTS)).toBe(igDmText(who, 0));
    expect(igDmText(who, -1)).toBe(igDmText(who, IG_DM_VARIANTS - 1));
  });
  it("remembers who was messaged, counts today's, and can clear a mark", () => {
    const now = new Date(2026, 10, 11, 15, 0, 0).getTime();
    let data = { igDms: { old_one: now - 3 * 86_400_000 } } as unknown as AdminData;
    data = logIgDm(data, "JoesRoofing", true, now - 60_000);
    data = logIgDm(data, "bella.vita", true, now);
    expect(data.igDms).toMatchObject({ joesroofing: now - 60_000, "bella.vita": now });
    expect(igDmsToday(data.igDms, now)).toBe(2);
    data = logIgDm(data, "joesroofing", false);
    expect(data.igDms?.joesroofing).toBeUndefined();
    expect(igDmsToday(data.igDms, now)).toBe(1);
    expect(logIgDm(data, "", true)).toBe(data); // nothing to log
    expect(igDmsToday(undefined)).toBe(0);
  });
  it("reads the handle back from a stored profile link", () => {
    expect(igHandleOf("https://www.instagram.com/Joes.Roofing")).toBe("joes.roofing");
    expect(igHandleOf("")).toBe("");
    expect(igHandleOf(undefined)).toBe("");
  });
});

describe("Instagram travels with the business", () => {
  const raw = (over = {}) => ({ id: "r1", business: "Joe's Roofing", email: "", phone: "", website: "joesroofing.com", city: "Denver", industry: "Roofing", status: "raw" as const, scrapedAt: 1, ...over });
  it("into Raw Data — and fills in an existing row without replacing what's there", () => {
    const withIg = raw({ id: "new", instagram: "https://www.instagram.com/joesroofing", instagramSure: true, instagramFollowers: 1200 });
    const merged = addToRaw([raw()], [withIg]);
    expect(merged.updated).toBe(1);
    expect(merged.raw[0]).toMatchObject({ id: "r1", instagram: "https://www.instagram.com/joesroofing", instagramSure: true, instagramFollowers: 1200 });
    const kept = addToRaw([raw({ instagram: "https://www.instagram.com/original" })], [withIg]);
    expect(kept.raw[0].instagram).toBe("https://www.instagram.com/original");
  });
  it("out of a Raw Data reveal, and isn't searched for again once on file", () => {
    const found = mergeRawReveal(raw(), { id: "r1", email: "", phone: "", website: "", source: "", sourceUrl: "", instagram: "https://www.instagram.com/joesroofing", instagramSure: false, instagramFollowers: 900 });
    expect(found).toMatchObject({ instagram: "https://www.instagram.com/joesroofing", instagramSure: false, instagramFollowers: 900 });
    expect(rawScanPerson(found).instagram).toBe("https://www.instagram.com/joesroofing");
    expect(rawScanPerson(raw()).instagram).toBeUndefined();
  });
  it("back out of a stored scan, including one known only from the listing", () => {
    const job = {
      people: [
        { id: "a", name: "", domain: "a.com", organizationName: "A" },
        { id: "b", name: "", domain: "", organizationName: "B", instagram: "https://www.instagram.com/b_only", bioLink: "" },
      ],
      results: { a: { email: "", phone: "", website: "a.com", source: "", sourceUrl: "", instagram: "https://www.instagram.com/a_biz", instagramSure: false, instagramVia: "search", instagramFollowers: 5300, instagramWhy: "the name matches" } },
    } as unknown as ScanJobFull;
    const [a, b] = rowsFromScan(job);
    expect(a).toMatchObject({ instagram: "https://www.instagram.com/a_biz", instagramSure: false, instagramVia: "search", instagramFollowers: 5300 });
    expect(b).toMatchObject({ instagram: "https://www.instagram.com/b_only", instagramSure: true, instagramVia: "listing" });
  });
});
