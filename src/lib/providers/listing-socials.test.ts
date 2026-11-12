import { afterEach, describe, expect, it, vi } from "vitest";
import { listingSocials } from "../instagram";
import { apifyItems } from "./apify";
import { parseGmapsCsv } from "./gmaps-self";
import { overpassBusinesses } from "./osm";
import { placesTextSearch } from "./places";

afterEach(() => vi.unstubAllGlobals());

describe("a listing whose 'website' is really their Instagram", () => {
  it("is recognised (and a link-in-bio page too), a normal site is left alone", () => {
    expect(listingSocials("https://www.instagram.com/joesroofing/")).toEqual({ instagram: "https://www.instagram.com/joesroofing" });
    expect(listingSocials("https://linktr.ee/joesroofing")).toEqual({ bioLink: "https://linktr.ee/joesroofing" });
    expect(listingSocials("https://joesroofing.com")).toEqual({});
    expect(listingSocials("https://www.facebook.com/joesroofing")).toEqual({});
    expect(listingSocials(undefined)).toEqual({});
  });

  it("Google Places: the Instagram is kept instead of being thrown away with the non-website", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      places: [
        { id: "p1", displayName: { text: "Joe's Roofing" }, websiteUri: "https://www.instagram.com/joesroofing/", nationalPhoneNumber: "303" },
        { id: "p2", displayName: { text: "Bella Vita" }, websiteUri: "https://linktr.ee/bellavita" },
        { id: "p3", displayName: { text: "Normal Co" }, websiteUri: "https://normal.example/" },
      ],
    })));
    const r = await placesTextSearch("key", { keyword: "roofing", location: "Denver", max: 20 });
    expect(r.businesses.map((b) => [b.company, b.instagram, b.bioLink])).toEqual([
      ["Joe's Roofing", "https://www.instagram.com/joesroofing", undefined],
      ["Bella Vita", undefined, "https://linktr.ee/bellavita"],
      ["Normal Co", undefined, undefined],
    ]);
  });

  it("OpenStreetMap: reads contact:instagram (a handle or a link), and keeps a business that has only that", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      elements: [
        { type: "node", id: 1, lat: 1, lon: 1, tags: { name: "Joe's Roofing", "contact:instagram": "@joesroofing", craft: "roofer" } },
        { type: "node", id: 2, lat: 1, lon: 1, tags: { name: "Bella Vita", website: "https://bellavita.example", "contact:instagram": "https://www.instagram.com/bella.vita/", shop: "hairdresser" } },
        { type: "node", id: 3, lat: 1, lon: 1, tags: { name: "No Contact At All", craft: "roofer" } },
      ],
    })));
    const { businesses: rows } = await overpassBusinesses({ keyword: "roofer", bbox: [39.6, 39.8, -105.1, -104.9], city: "Denver", max: 20, timeoutSec: 5 });
    expect(rows.map((b) => [b.company, b.instagram])).toEqual([
      ["Joe's Roofing", "https://www.instagram.com/joesroofing"],
      ["Bella Vita", "https://www.instagram.com/bella.vita"],
    ]);
  });

  it("Apify: an Instagram-only business is kept (other aggregator links are still skipped)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([
      { placeId: "a1", title: "Joe's Roofing", website: "https://www.instagram.com/joesroofing" },
      { placeId: "a2", title: "Yelp Only", website: "https://www.yelp.com/biz/yelp-only" },
      { placeId: "a3", title: "Normal Co", website: "https://normal.example" },
    ])));
    const rows = await apifyItems({ APIFY_TOKEN: "t" }, "ds", "Denver", "Roofing");
    expect(rows.map((b) => [b.company, b.website, b.instagram])).toEqual([
      ["Joe's Roofing", "", "https://www.instagram.com/joesroofing"],
      ["Normal Co", "normal.example", undefined],
    ]);
  });

  it("own Maps scraper: same", () => {
    const rows = parseGmapsCsv('title,website\n"Joe\'s Roofing",https://www.instagram.com/joesroofing/\n"Normal Co",https://normalco.com\n', "Denver", "Roofing");
    expect(rows.map((b) => [b.company, b.website, b.instagram])).toEqual([
      ["Joe's Roofing", "", "https://www.instagram.com/joesroofing"],
      ["Normal Co", "https://normalco.com", undefined],
    ]);
  });
});
