import { describe, expect, it } from "vitest";
import { type EcomBrand, ecomFit } from "@/lib/ecom-brands";
import { igDmText, IG_DM_VARIANTS, type RawBusiness } from "./store";
import { addToRaw } from "./raw-merge";
import { igAccounts } from "./ig-board";
import {
  ECOM_FILTERS,
  cleanEcomBrands,
  cleanEcomCursors,
  ecomCounts,
  ecomCursorsAfter,
  ecomIsSaved,
  ecomMatches,
  ecomNiches,
  ecomSavedKeys,
  ecomScanSummary,
  ecomStartAt,
  ecomToRaw,
  ecomVisible,
  sortEcomBrands,
  trimEcomList,
} from "./ecom-board";

const brand = (over: Partial<EcomBrand>): EcomBrand => {
  const b = {
    key: "kaijuclothing.com",
    name: "Kaiju Clothing",
    website: "kaijuclothing.com",
    about: "Anime streetwear drops.",
    kind: "shop" as const,
    platform: "Shopify",
    email: "",
    instagram: "",
    instagramSure: false,
    instagramVia: "" as const,
    instagramWhy: "",
    followers: null,
    tiktok: "",
    tools: [],
    currency: "",
    niche: "Anime",
    industry: "online anime brands",
    source: "stores" as const,
    query: "anime streetwear",
    foundAt: 1_000,
    ...over,
  };
  return { ...b, ...ecomFit(b) };
};

const kaiju = brand({
  email: "hello@kaijuclothing.com",
  instagram: "https://www.instagram.com/kaijuclothing",
  instagramSure: true,
  instagramVia: "site",
  instagramWhy: "linked on their website, and the handle matches the business name",
  followers: 12_400,
});
const otaku = brand({
  key: "ig:otaku.supply",
  name: "Otaku Supply",
  website: "",
  kind: "page",
  platform: "",
  about: "Handmade pins",
  instagram: "https://www.instagram.com/otaku.supply",
  instagramSure: true,
  instagramVia: "search",
  instagramWhy: "found by searching Instagram for anime brands",
  followers: 950,
  source: "instagram",
  foundAt: 3_000,
});
const sora = brand({
  key: "soraworld.ca",
  name: "Sora World",
  website: "soraworld.ca",
  email: "info@soraworld.ca",
  foundAt: 2_000,
});
const candle = brand({
  key: "wickandco.com",
  name: "Wick & Co",
  website: "wickandco.com",
  niche: "Household",
  industry: "online home goods brands",
  about: "Soy candles",
});

describe("the saved list of the Ecom scanner", () => {
  it("comes back as it was saved", () => {
    expect(cleanEcomBrands(JSON.parse(JSON.stringify([kaiju, otaku])))).toEqual([kaiju, otaku]);
  });

  it("drops what is not a whole brand and repairs what it can", () => {
    const cleaned = cleanEcomBrands([
      null,
      "x",
      { key: "", name: "No key" },
      { key: "nothing.com", name: "Neither a site nor an account" },
      {
        key: "KAIJUCLOTHING.COM",
        website: "https://www.kaijuclothing.com/",
        instagram: "https://www.instagram.com/popular/anime",
        followers: 5,
        tools: "x",
        kind: "weird",
        why: 3,
      },
      { key: "kaijuclothing.com", website: "kaijuclothing.com" },
    ]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]).toMatchObject({
      key: "kaijuclothing.com",
      name: "kaijuclothing.com",
      website: "kaijuclothing.com",
      // Instagram's own "popular" page is nobody's account.
      instagram: "",
      followers: null,
      tools: [],
      kind: "page",
      source: "stores",
      why: [],
    });
    expect(cleanEcomBrands(undefined)).toEqual([]);
    expect(cleanEcomBrands({ brands: [] })).toEqual([]);
  });

  it("keeps the newest finds when it grows past its limit", () => {
    const many = [kaiju, otaku, sora];
    expect(trimEcomList(many, 5)).toBe(many);
    expect(trimEcomList(many, 2).map((b) => b.name)).toEqual(["Otaku Supply", "Sora World"]);
  });
});

describe("what the list shows", () => {
  const all = [kaiju, otaku, sora, candle];

  it("counts who can be reached how", () => {
    expect(ecomCounts(all)).toEqual({ all: 4, instagram: 2, email: 2, both: 1 });
    expect(ECOM_FILTERS.map((f) => f.id)).toEqual(["all", "instagram", "email", "both"]);
  });

  it("finds a brand by its name, site, account, email or what it sells", () => {
    expect(ecomMatches(kaiju, "KAIJU")).toBe(true);
    expect(ecomMatches(otaku, "@otaku.supply")).toBe(true);
    expect(ecomMatches(sora, "soraworld.ca")).toBe(true);
    expect(ecomMatches(candle, "candles")).toBe(true);
    expect(ecomMatches(kaiju, "hello@")).toBe(true);
    expect(ecomMatches(kaiju, "soap")).toBe(false);
    expect(ecomMatches(kaiju, "  ")).toBe(true);
  });

  it("filters by reach, niche and search together, best to contact first", () => {
    const view = {
      filter: "all" as const,
      q: "",
      niche: "",
      sort: { key: "score" as const, dir: "desc" as const },
    };
    expect(ecomVisible(all, view).map((b) => b.name)).toEqual([
      "Kaiju Clothing",
      "Sora World",
      "Otaku Supply",
      "Wick & Co",
    ]);
    expect(ecomVisible(all, { ...view, filter: "instagram" }).map((b) => b.name)).toEqual([
      "Kaiju Clothing",
      "Otaku Supply",
    ]);
    expect(ecomVisible(all, { ...view, niche: "Household" }).map((b) => b.name)).toEqual([
      "Wick & Co",
    ]);
    expect(ecomVisible(all, { ...view, filter: "email", q: "sora" }).map((b) => b.name)).toEqual([
      "Sora World",
    ]);
  });

  it("sorts by followers with the unknown ones last, either way round", () => {
    const names = (key: "followers" | "name" | "found", dir: "asc" | "desc") =>
      sortEcomBrands(all, { key, dir }).map((b) => b.name);
    expect(names("followers", "desc")).toEqual([
      "Kaiju Clothing",
      "Otaku Supply",
      "Sora World",
      "Wick & Co",
    ]);
    expect(names("followers", "asc")).toEqual([
      "Otaku Supply",
      "Kaiju Clothing",
      "Sora World",
      "Wick & Co",
    ]);
    expect(names("name", "asc")).toEqual([
      "Kaiju Clothing",
      "Otaku Supply",
      "Sora World",
      "Wick & Co",
    ]);
    expect(names("found", "desc")[0]).toBe("Otaku Supply");
  });

  it("lists the niches when there is more than one", () => {
    expect(ecomNiches(all)).toEqual([
      { niche: "Anime", n: 3 },
      { niche: "Household", n: 1 },
    ]);
  });
});

describe("a brand saved to Raw Data", () => {
  it("carries its contact details, its trade and where its Instagram was found", () => {
    expect(ecomToRaw(kaiju, "r1", 9_000)).toEqual({
      id: "r1",
      business: "Kaiju Clothing",
      email: "hello@kaijuclothing.com",
      phone: "",
      website: "kaijuclothing.com",
      city: "",
      industry: "online anime brands",
      status: "raw",
      scrapedAt: 9_000,
      source: "Ecom scanner",
      emailSource: "Website",
      score: 95,
      scoreWhy: ["Shopify shop", "Instagram found", "email on their site", "12k followers"],
      instagram: "https://www.instagram.com/kaijuclothing",
      instagramSure: true,
      instagramFollowers: 12_400,
      instagramVia: "site",
      instagramWhy: "linked on their website, and the handle matches the business name",
    });
  });

  it("has no Instagram details when no account was found", () => {
    const row = ecomToRaw(sora, "r2", 9_000);
    expect(row).toMatchObject({
      business: "Sora World",
      email: "info@soraworld.ca",
      emailSource: "Website",
    });
    expect(row.instagram).toBeUndefined();
    expect(row.instagramSure).toBeUndefined();
    expect(row.instagramVia).toBeUndefined();
  });

  it("lands in Instagram DMs: sure accounts to DM, unsure ones to check first", () => {
    const unsure = brand({
      key: "nami.shop",
      name: "Nami",
      website: "nami.shop",
      instagram: "https://www.instagram.com/other_name",
      instagramSure: false,
      instagramVia: "site",
      instagramWhy:
        "linked on one page of their website, under a different name (check it's theirs)",
    });
    const raw = addToRaw(
      [],
      [
        ecomToRaw(kaiju, "r1"),
        ecomToRaw(otaku, "r2"),
        ecomToRaw(unsure, "r3"),
        ecomToRaw(sora, "r4"),
      ],
    ).raw;
    const board = igAccounts({ raw, igDms: {}, igMarks: {} });
    expect(board.map((a) => [a.handle, a.stage, a.industry, a.followers]).sort()).toEqual([
      ["kaijuclothing", "todo", "online anime brands", 12_400],
      ["otaku.supply", "todo", "online anime brands", 950],
      ["other_name", "check", "online anime brands", null],
    ]);
  });

  it("is added once, and gives a brand that is already saved only what it was missing", () => {
    const existing: RawBusiness = {
      id: "old",
      business: "Kaiju",
      email: "owner@kaijuclothing.com",
      phone: "",
      website: "https://kaijuclothing.com",
      city: "",
      industry: "clothing",
      status: "accepted",
      scrapedAt: 1,
    };
    const { raw, added, updated } = addToRaw(
      [existing],
      [ecomToRaw(kaiju, "r1"), ecomToRaw(kaiju, "r1b")],
    );
    expect([added, updated]).toEqual([0, 2]);
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({
      id: "old",
      business: "Kaiju",
      email: "owner@kaijuclothing.com",
      status: "accepted",
      industry: "clothing",
      instagram: "https://www.instagram.com/kaijuclothing",
      instagramVia: "site",
    });
  });

  it("is recognised in the list as already saved, by its shop or its account", () => {
    const saved = ecomSavedKeys([
      { website: "https://www.kaijuclothing.com/", instagram: "" },
      { website: "", instagram: "https://www.instagram.com/otaku.supply/" },
    ]);
    expect(ecomIsSaved(kaiju, saved)).toBe(true);
    expect(ecomIsSaved(otaku, saved)).toBe(true);
    expect(ecomIsSaved(sora, saved)).toBe(false);
  });
});

describe("the opener for an online brand", () => {
  it("speaks of the brand's niche, never of a town or local customers", () => {
    for (let variant = 0; variant < IG_DM_VARIANTS; variant++) {
      const text = igDmText(
        { company: "Kaiju Clothing", industry: "online anime brands", city: "" },
        variant,
      );
      expect(text).toContain("Kaiju Clothing");
      expect(text).toContain("anime brands");
      expect(text).not.toMatch(/local|customers|online anime brands| in \b/);
      expect(text).not.toMatch(/https?:\/\//);
      expect(text.startsWith("Hey!")).toBe(true);
    }
    expect(
      new Set(
        [0, 1, 2, 3].map((v) => igDmText({ company: "Kaiju", industry: "online anime brands" }, v)),
      ).size,
    ).toBe(4);
  });

  it("greets a brand by its name, not by the tagline after it", () => {
    expect(
      igDmText({ company: "KAIJU | anime streetwear", industry: "online anime brands" }, 0),
    ).toContain("Came across KAIJU and");
    expect(igDmText({ company: "", industry: "online home goods brands" }, 0)).toContain(
      "your brand",
    );
  });

  it("leaves the opener for a local business as it was", () => {
    const text = igDmText(
      { company: "Joe's Roofing", name: "Joe Smith", city: "Denver", industry: "Roofing" },
      0,
    );
    expect(text).toContain("Hey Joe!");
    expect(text).toContain("in Denver");
    expect(text).toContain("roofing");
  });
});

describe("what a finished scan says", () => {
  const tally = {
    searches: 18,
    found: 42,
    withInstagram: 35,
    withEmail: 27,
    notBrands: 12,
    seen: 3,
    notShops: 9,
  };

  it("gives the result, the cost and what was left out", () => {
    expect(ecomScanSummary(tally)).toBe(
      "Found 42 new brands with 18 searches: 35 with Instagram, 27 with an email. Left out: 3 found before, 12 marketplaces, big names and fan pages, 9 sites that sell nothing.",
    );
  });

  it("says why it ended early", () => {
    const one = {
      searches: 1,
      found: 1,
      withInstagram: 1,
      withEmail: 0,
      notBrands: 1,
      seen: 0,
      notShops: 1,
    };
    expect(ecomScanSummary(one, "stopped")).toBe(
      "Found 1 new brand with 1 search: 1 with Instagram, 0 with an email. Left out: 1 marketplace, big name or fan page, 1 site that sells nothing. Stopped.",
    );
    expect(
      ecomScanSummary({ ...one, found: 0, notBrands: 0, notShops: 0, searches: 5 }, "dry"),
    ).toBe("No new brands in 5 searches. Stopped early: the last searches found nothing new.");
    expect(
      ecomScanSummary({ ...one, found: 0, searches: 0, notBrands: 0, notShops: 0 }, "plan"),
    ).toBe("No search was used. Every search for this niche has run.");
  });
});

describe("where the next scan of a niche carries on", () => {
  const scan = {
    niche: "anime",
    market: "",
    sources: ["stores", "instagram"] as ("stores" | "instagram")[],
    onlyNew: true,
  };

  it("starts at the top for a niche that was never scanned", () => {
    expect(ecomStartAt(undefined, scan)).toEqual({ startAt: {}, continuing: false });
    expect(ecomStartAt({ "clothing||stores": 10 }, scan)).toEqual({
      startAt: {},
      continuing: false,
    });
  });

  it("picks each source up after the searches that already ran", () => {
    const cursors = ecomCursorsAfter(undefined, scan, { stores: 10, instagram: 10 });
    expect(cursors).toEqual({ "anime||stores": 10, "anime||instagram": 10 });
    expect(ecomStartAt(cursors, scan)).toEqual({
      startAt: { stores: 10, instagram: 10 },
      continuing: true,
    });
    // The same niche in another country, or typed differently, is its own scan.
    expect(ecomStartAt(cursors, { ...scan, market: "be" }).continuing).toBe(false);
    expect(ecomStartAt(cursors, { ...scan, niche: "Anime " }).continuing).toBe(true);
    // Only the sources that are asked for.
    expect(ecomStartAt(cursors, { ...scan, sources: ["instagram"] }).startAt).toEqual({
      instagram: 10,
    });
  });

  it("starts over once every search has run, and whenever Only new is off", () => {
    const done = ecomCursorsAfter(undefined, scan, { stores: 60, instagram: 12 });
    expect(ecomStartAt(done, scan)).toEqual({ startAt: { instagram: 12 }, continuing: true });
    expect(ecomStartAt(done, { ...scan, onlyNew: false })).toEqual({
      startAt: {},
      continuing: false,
    });
  });

  it("moves a source on without touching the others, and remembers the latest niches", () => {
    let cursors = ecomCursorsAfter(
      { "anime||stores": 10, "clothing||stores": 4 },
      { ...scan, sources: ["stores"] },
      { stores: 20, instagram: 99 },
    );
    expect(cursors).toEqual({ "clothing||stores": 4, "anime||stores": 20 });
    for (let i = 0; i < 70; i++)
      cursors = ecomCursorsAfter(
        cursors,
        { niche: `niche ${i}`, market: "", sources: ["stores"] },
        { stores: 5 },
      );
    expect(Object.keys(cursors)).toHaveLength(60);
    expect(cursors["niche 69||stores"]).toBe(5);
    expect(cursors["anime||stores"]).toBeUndefined();
  });

  it("ignores saved progress that is not a whole number", () => {
    expect(cleanEcomCursors({ a: 3, b: -1, c: 2.5, d: "4", e: 5000, "": 2 })).toEqual({ a: 3 });
    expect(cleanEcomCursors([1, 2])).toEqual({});
    expect(cleanEcomCursors(null)).toEqual({});
  });
});
