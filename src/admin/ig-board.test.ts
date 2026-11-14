import { describe, expect, it } from "vitest";
import {
  IG_SEARCH_REST_MS,
  cleanIgMarks,
  cleanIgUrl,
  cleanInstagramResults,
  cleanInstagramRows,
  confirmInstagram,
  igAccounts,
  igCounts,
  igDefaultSort,
  igFinderTargets,
  igMatches,
  igRowTrust,
  moveIgAccounts,
  rejectInstagram,
  restoreIgMarks,
  sortIgAccounts,
} from "./ig-board";
import { igFinderSummary } from "./ig-finder";
import { addToRaw } from "./raw-merge";
import { mergeRawReveal, rawScanPerson } from "./raw-reveal";
import { type AdminData, type RawBusiness, type ScanJobFull, igDmsToday, logIgDm, rowsFromScan } from "./store";

const ig = (handle: string) => `https://www.instagram.com/${handle}`;
let n = 0;
const row = (over: Partial<RawBusiness> = {}): RawBusiness => ({
  id: `r${++n}`, business: "Joe's Roofing", email: "", phone: "", website: "joesroofing.com",
  city: "Denver", industry: "Roofing", status: "raw", scrapedAt: 1_000, ...over,
});
const data = (raw: RawBusiness[], over: Partial<AdminData> = {}) => ({ raw, igDms: {}, igMarks: {}, ...over }) as AdminData;
const NOW = new Date(2026, 10, 14, 15, 0, 0).getTime();
const DAY = 86_400_000;
const handles = (list: { handle: string }[]) => list.map((a) => a.handle);

describe("junk never reaches the list", () => {
  it("takes off anything that isn't a real profile, and tidies the rest", () => {
    const rows = [
      row({ id: "a", instagram: ig("popular"), instagramSure: true, instagramFollowers: 12 }),
      row({ id: "b", instagram: "https://www.instagram.com/popular/roofers-denver/" }),
      row({ id: "c", instagram: "https://instagram.com/yourusername" }),
      row({ id: "d", instagram: "https://www.instagram.com/elfsight" }),
      row({ id: "e", instagram: "http://instagram.com/JoesRoofing/?hl=en", instagramSure: true }),
      row({ id: "f", email: "office@joesroofing.com" }),
    ];
    const clean = cleanInstagramRows(rows);
    for (const id of ["a", "b", "c", "d"]) {
      const r = clean.find((x) => x.id === id)!;
      expect(r.instagram, id).toBeUndefined();
      expect(r.instagramSure, id).toBeUndefined();
      expect(r.instagramFollowers, id).toBeUndefined();
      expect(r.business).toBe("Joe's Roofing"); // nothing else is touched
    }
    expect(clean.find((x) => x.id === "e")).toMatchObject({ instagram: ig("joesroofing"), instagramSure: true });
    expect(clean.find((x) => x.id === "f")).toEqual(rows[5]);
    // already clean: the very same list comes back (no needless saves)
    expect(cleanInstagramRows(clean)).toBe(clean);
  });
  it("an account sitting on three or more differently named businesses stays only where it fits", () => {
    const rows = [
      row({ id: "a", business: "Elite Roofing", website: "", instagram: ig("denver_roofers_hub") }),
      row({ id: "b", business: "Summit Exteriors", website: "", instagram: ig("denver_roofers_hub") }),
      row({ id: "c", business: "Apex Gutters", website: "", instagram: ig("denver_roofers_hub") }),
      row({ id: "d", business: "Denver Roofers Hub", website: "", instagram: ig("denver_roofers_hub") }),
      // a franchise: three locations, one account, and it fits them all
      row({ id: "e", business: "Mr. Rooter Plumbing of Denver", website: "", instagram: ig("mrrooter") }),
      row({ id: "f", business: "Mr. Rooter Plumbing of Aurora", website: "", instagram: ig("mrrooter") }),
      row({ id: "g", business: "Mr. Rooter Plumbing of Boulder", website: "", instagram: ig("mrrooter") }),
      // looked at by hand: kept whatever it is called
      row({ id: "h", business: "Peak Siding", website: "", instagram: ig("denver_roofers_hub"), instagramChecked: true }),
    ];
    const kept = new Map(cleanInstagramRows(rows).map((r) => [r.id, r.instagram]));
    expect(kept.get("a")).toBeUndefined();
    expect(kept.get("b")).toBeUndefined();
    expect(kept.get("c")).toBeUndefined();
    expect(kept.get("d")).toBe(ig("denver_roofers_hub"));
    expect([kept.get("e"), kept.get("f"), kept.get("g")]).toEqual([ig("mrrooter"), ig("mrrooter"), ig("mrrooter")]);
    expect(kept.get("h")).toBe(ig("denver_roofers_hub"));
  });
  it("junk in an older stored scan doesn't come back when the scan is reopened or saved", () => {
    const job = {
      updated_at: "2026-11-10T10:00:00.000Z",
      people: [
        { id: "a", name: "", domain: "a.com", organizationName: "Alpha Roofing" },
        { id: "b", name: "", domain: "", organizationName: "Bravo Roofing", instagram: ig("bravoroofing") },
        { id: "c", name: "", domain: "", organizationName: "Charlie Roofing" },
      ],
      results: {
        a: { email: "", phone: "", website: "a.com", source: "", sourceUrl: "", instagram: ig("popular"), instagramSure: true, instagramVia: "search", instagramFollowers: 12, instagramWhy: "the name matches and it mentions Denver", instagramSearches: 1 },
        b: { email: "", phone: "", website: "", source: "", sourceUrl: "", instagram: "https://www.instagram.com/popular/bravo-roofing/", instagramVia: "search" },
        c: { email: "", phone: "", website: "", source: "", sourceUrl: "" },
      },
    } as unknown as ScanJobFull;
    const [a, b, c] = rowsFromScan(job);
    expect(a).toMatchObject({ instagram: "", instagramFollowers: null, igSearchedAt: Date.parse("2026-11-10T10:00:00.000Z") });
    expect(a.instagramSure).toBeUndefined();
    expect(a.instagramWhy).toBeUndefined();
    expect(b).toMatchObject({ instagram: ig("bravoroofing"), instagramSure: true, instagramVia: "listing" }); // the listing's own link still counts
    expect(c.igSearchedAt).toBeUndefined();
    // saving a result that still carries junk
    const saved = addToRaw([], [row({ id: "x", business: "Alpha Roofing", website: "a.com", instagram: ig("popular"), instagramSure: true })]);
    expect(saved.added).toBe(1);
    expect(saved.raw[0].instagram).toBeUndefined();
  });
  it("cleans results that aren't saved yet, and old marks", () => {
    const results = cleanInstagramResults([{ id: "1", instagram: ig("popular"), instagramSure: true }, { id: "2", instagram: "instagram.com/JoesRoofing" }, { id: "3" }]);
    expect(results).toEqual([{ id: "1" }, { id: "2", instagram: ig("joesroofing") }, { id: "3" }]);
    expect(cleanIgUrl("https://www.instagram.com/popular/x/")).toBe("");
    const marks = cleanIgMarks({ igDms: { popular: 5, joesroofing: 9, JoesRoofing: 7 }, igMarks: { popular: { stage: "skip", at: 1 }, maven: { stage: "replied", at: 2 }, odd: { at: 3 } } });
    expect(marks.igDms).toEqual({ joesroofing: 9 });
    expect(marks.igMarks).toEqual({ maven: { stage: "replied", at: 2 } });
    expect(cleanIgMarks({})).toEqual({ igDms: {}, igMarks: {} });
  });
});

describe("one line per account", () => {
  it("groups every saved copy of a business under its account", () => {
    const rows = [
      row({ id: "a", instagram: ig("joesroofing"), instagramVia: "site", instagramFollowers: 900, score: 40, scrapedAt: 10 }),
      row({ id: "b", business: "Joes Roofing LLC", phone: "303", instagram: ig("joesroofing"), instagramVia: "search", instagramFollowers: 1200, score: 72, scrapedAt: 30 }),
      row({ id: "c", business: "Maven Tree Services", website: "", instagram: ig("maventreeservices"), instagramVia: "listing" }),
      row({ id: "d", business: "No Instagram Co" }),
    ];
    const list = igAccounts(data(rows));
    expect(handles(list).sort()).toEqual(["joesroofing", "maventreeservices"]);
    const joe = list.find((a) => a.handle === "joesroofing")!;
    expect(joe.rows.map((r) => r.id).sort()).toEqual(["a", "b"]);
    expect(joe).toMatchObject({ followers: 1200, score: 72, addedAt: 30, others: [], stage: "todo", url: ig("joesroofing") });
  });
  it("says so when one account sits on differently named businesses", () => {
    const list = igAccounts(data([
      row({ id: "a", instagram: ig("joesroofing"), instagramVia: "site" }),
      row({ id: "b", business: "Mile High Gutters", website: "", instagram: ig("joesroofing"), instagramSure: false }),
    ]));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ business: "Joe's Roofing", others: ["Mile High Gutters"], sure: true });
  });
  it("keeps an account messaged from a search result that was never saved", () => {
    const list = igAccounts(data([], { igDms: { strayaccount: 5 }, igMarks: { other_one: { stage: "skip", at: 6 }, popular: { stage: "skip", at: 7 } } }));
    expect(list.map((a) => [a.handle, a.stage, a.rows.length])).toEqual([["strayaccount", "dmed", 0], ["other_one", "skip", 0]]);
  });
});

describe("which section an account is in", () => {
  it("only accounts we are sure of go straight to the list to DM", () => {
    // why it's theirs was saved with it
    expect(igRowTrust(row({ instagram: ig("mile_high_roofs"), instagramVia: "site", instagramWhy: "the only Instagram profile their website links to" }))).toMatchObject({ sure: true, why: "the only Instagram profile their website links to" });
    // a name-only match
    expect(igRowTrust(row({ instagram: ig("joesroofing"), instagramSure: false, instagramVia: "search" })).sure).toBe(false);
    // saved before the reason was kept: trusted when the handle looks like the business…
    expect(igRowTrust(row({ instagram: ig("joesroofingdenver"), instagramSure: true })).sure).toBe(true);
    // …and worth a look when it doesn't
    expect(igRowTrust(row({ instagram: ig("the_best_account"), instagramSure: true }))).toMatchObject({ sure: false, why: "the handle doesn't look like the business name" });
    // looked at by hand
    expect(igRowTrust(row({ instagram: ig("the_best_account"), instagramSure: false, instagramChecked: true })).sure).toBe(true);
  });
  it("files accounts by what was done, and counts each section", () => {
    const rows = [
      row({ instagram: ig("todo_one"), instagramVia: "site" }),
      row({ instagram: ig("check_one"), instagramSure: false }),
      row({ instagram: ig("dmed_one"), instagramVia: "site" }),
      row({ instagram: ig("replied_one"), instagramVia: "site" }),
      row({ instagram: ig("skipped_one"), instagramVia: "site" }),
      row({ instagram: ig("rejected_biz"), instagramVia: "site", status: "rejected" }),
      row({ instagram: ig("accepted_biz"), instagramVia: "site", status: "accepted" }),
    ];
    const d = data(rows, { igDms: { dmed_one: 5, replied_one: 4 }, igMarks: { replied_one: { stage: "replied", at: 6 }, skipped_one: { stage: "skip", at: 7 } } });
    const stage = Object.fromEntries(igAccounts(d).map((a) => [a.handle, a.stage]));
    expect(stage).toEqual({ todo_one: "todo", check_one: "check", dmed_one: "dmed", replied_one: "replied", skipped_one: "skip", rejected_biz: "skip", accepted_biz: "todo" });
    expect(igCounts(igAccounts(d))).toEqual({ todo: 2, check: 1, dmed: 1, replied: 1, skip: 2 });
  });
});

describe("moving accounts between sections", () => {
  const base = () => data([row({ instagram: ig("joesroofing"), instagramVia: "site" }), row({ business: "Maven Tree Services", website: "", instagram: ig("maventreeservices"), instagramVia: "site" })]);
  const stageOf = (d: AdminData, h: string) => igAccounts(d).find((a) => a.handle === h)?.stage;
  it("goes there and back: DMed, replied, not a fit, back to the list", () => {
    let d = moveIgAccounts(base(), ["joesroofing"], "dmed", NOW);
    expect(stageOf(d, "joesroofing")).toBe("dmed");
    expect(d.igDms).toEqual({ joesroofing: NOW });
    d = moveIgAccounts(d, ["joesroofing"], "replied", NOW + DAY);
    expect(stageOf(d, "joesroofing")).toBe("replied");
    expect(d.igDms?.joesroofing).toBe(NOW); // the DM date is kept
    d = moveIgAccounts(d, ["joesroofing"], "dmed", NOW + 2 * DAY);
    expect(stageOf(d, "joesroofing")).toBe("dmed");
    expect(d.igDms?.joesroofing).toBe(NOW);
    d = moveIgAccounts(d, ["joesroofing"], "skip", NOW + 3 * DAY);
    expect(stageOf(d, "joesroofing")).toBe("skip");
    d = moveIgAccounts(d, ["joesroofing"], "todo", NOW + 4 * DAY);
    expect(stageOf(d, "joesroofing")).toBe("todo");
    expect(d.igDms).toEqual({});
    expect(d.igMarks).toEqual({});
    expect(stageOf(d, "maventreeservices")).toBe("todo"); // the other account never moved
  });
  it("accounts filed as DMed earlier are not counted as today's", () => {
    const one = moveIgAccounts(base(), ["joesroofing"], "dmed", NOW);
    expect(igDmsToday(one.igDms, NOW, one.igMarks)).toBe(1);
    const filed = moveIgAccounts(base(), ["joesroofing", "maventreeservices"], "dmed", NOW, { filed: true });
    expect(igAccounts(filed).map((a) => a.stage)).toEqual(["dmed", "dmed"]);
    expect(igDmsToday(filed.igDms, NOW, filed.igMarks)).toBe(0);
    // a reply filed for someone never marked as DMed doesn't invent a DM today either
    const replied = moveIgAccounts(base(), ["joesroofing"], "replied", NOW);
    expect(igDmsToday(replied.igDms, NOW, replied.igMarks)).toBe(0);
    // yesterday's are yesterday's
    expect(igDmsToday(one.igDms, NOW + DAY, one.igMarks)).toBe(0);
  });
  it("undo puts exactly those accounts back", () => {
    const before = moveIgAccounts(base(), ["maventreeservices"], "dmed", NOW - DAY);
    const after = moveIgAccounts(before, ["joesroofing", "maventreeservices"], "skip", NOW);
    const undone = restoreIgMarks(after, ["joesroofing", "maventreeservices"], before);
    expect(undone.igDms).toEqual(before.igDms);
    expect(undone.igMarks).toEqual(before.igMarks);
  });
  it("the DM button on a row files it too — and a reply stays a reply", () => {
    let d = moveIgAccounts(base(), ["joesroofing"], "skip", NOW);
    d = logIgDm(d, "joesroofing", true, NOW + 1);
    expect(stageOf(d, "joesroofing")).toBe("dmed"); // messaged after all
    d = moveIgAccounts(d, ["joesroofing"], "replied", NOW + 2);
    d = logIgDm(d, "joesroofing", true, NOW + 3);
    expect(stageOf(d, "joesroofing")).toBe("replied");
    d = logIgDm(d, "joesroofing", false);
    expect(stageOf(d, "joesroofing")).toBe("todo");
  });
  it("ignores things that aren't accounts", () => {
    const d = base();
    expect(moveIgAccounts(d, ["popular", "", "two words"], "dmed", NOW)).toBe(d);
  });
});

describe("checking an account by hand", () => {
  it("\"It's theirs\" moves it to the list to DM for good", () => {
    const rows = confirmInstagram([row({ id: "a", instagram: ig("the_best_account"), instagramSure: false })], ["the_best_account"]);
    expect(rows[0]).toMatchObject({ instagramSure: true, instagramChecked: true });
    expect(igAccounts(data(rows))[0].stage).toBe("todo");
  });
  it("\"Wrong account\" takes it off, and nothing puts it back", () => {
    const rows = rejectInstagram([row({ id: "a", instagram: ig("wrong_one"), instagramSure: false, instagramFollowers: 50 }), row({ id: "b", instagram: ig("joesroofing") })], ["wrong_one"], NOW);
    expect(rows[0].instagram).toBeUndefined();
    expect(rows[0].instagramFollowers).toBeUndefined();
    expect(rows[0]).toMatchObject({ instagramNot: ["wrong_one"], igSearchedAt: NOW });
    expect(rows[1].instagram).toBe(ig("joesroofing"));
    // a later reveal finds the same wrong account: it stays off, and a different one is taken
    const result = { id: "a", email: "", phone: "", website: "", source: "", sourceUrl: "" };
    expect(mergeRawReveal(rows[0], { ...result, instagram: ig("wrong_one") }).instagram).toBeUndefined();
    expect(mergeRawReveal(rows[0], { ...result, instagram: ig("joesroofingco"), instagramVia: "search", instagramWhy: "the profile mentions their website" }))
      .toMatchObject({ instagram: ig("joesroofingco"), instagramVia: "search", instagramWhy: "the profile mentions their website" });
    // the next search is told to look past it
    expect(rawScanPerson(rows[0]).igNot).toEqual(["wrong_one"]);
    expect(rawScanPerson(rows[1]).igNot).toBeUndefined();
    // the same business scraped again brings it back in: still off
    expect(addToRaw([rows[0]], [row({ id: "new", instagram: ig("wrong_one") })]).raw[0].instagram).toBeUndefined();
    // and the list never shows it
    expect(cleanInstagramRows([{ ...rows[0], instagram: ig("wrong_one") }])[0].instagram).toBeUndefined();
  });
});

describe("sorting and searching a section", () => {
  const list = () => igAccounts(data([
    row({ business: "Bravo Roofing", website: "", city: "Aurora", instagram: ig("bravoroofing"), instagramVia: "site", instagramFollowers: 5000, score: 60, scrapedAt: 30 }),
    row({ business: "Alpha Roofing", website: "", city: "Denver", instagram: ig("alpharoofing"), instagramVia: "site", instagramFollowers: 200, score: 90, scrapedAt: 10 }),
    row({ business: "Charlie Roofing", website: "", city: "", instagram: ig("charlieroofing"), instagramVia: "site", scrapedAt: 20, contactName: "Dana Whitfield" }),
  ], { igDms: { bravoroofing: 500, alpharoofing: 900 } }));
  it("sorts by any column, with missing values last either way", () => {
    expect(handles(sortIgAccounts(list(), { key: "score", dir: "desc" }))).toEqual(["alpharoofing", "bravoroofing", "charlieroofing"]);
    expect(handles(sortIgAccounts(list(), { key: "score", dir: "asc" }))).toEqual(["bravoroofing", "alpharoofing", "charlieroofing"]);
    expect(handles(sortIgAccounts(list(), { key: "followers", dir: "desc" }))).toEqual(["bravoroofing", "alpharoofing", "charlieroofing"]);
    expect(handles(sortIgAccounts(list(), { key: "followers", dir: "asc" }))).toEqual(["alpharoofing", "bravoroofing", "charlieroofing"]);
    expect(handles(sortIgAccounts(list(), { key: "added", dir: "desc" }))).toEqual(["bravoroofing", "charlieroofing", "alpharoofing"]);
    expect(handles(sortIgAccounts(list(), { key: "business", dir: "asc" }))).toEqual(["alpharoofing", "bravoroofing", "charlieroofing"]);
    expect(handles(sortIgAccounts(list(), { key: "city", dir: "asc" }))).toEqual(["bravoroofing", "alpharoofing", "charlieroofing"]);
    expect(handles(sortIgAccounts(list(), { key: "city", dir: "desc" }))).toEqual(["alpharoofing", "bravoroofing", "charlieroofing"]);
    expect(handles(sortIgAccounts(list(), { key: "dmed", dir: "desc" }))).toEqual(["alpharoofing", "bravoroofing", "charlieroofing"]);
    expect(handles(sortIgAccounts(list(), { key: "dmed", dir: "asc" }))).toEqual(["bravoroofing", "alpharoofing", "charlieroofing"]);
  });
  it("opens each section in a useful order", () => {
    expect(igDefaultSort("todo")).toEqual({ key: "score", dir: "desc" });
    expect(igDefaultSort("check")).toEqual({ key: "score", dir: "desc" });
    expect(igDefaultSort("dmed")).toEqual({ key: "dmed", dir: "desc" });
    expect(igDefaultSort("replied")).toEqual({ key: "dmed", dir: "desc" });
  });
  it("searches by account, business, contact or town", () => {
    const find = (q: string) => handles(list().filter((a) => igMatches(a, q)));
    expect(find("@bravo")).toEqual(["bravoroofing"]);
    expect(find("alpha roof")).toEqual(["alpharoofing"]);
    expect(find("denver")).toEqual(["alpharoofing"]);
    expect(find("whitfield")).toEqual(["charlieroofing"]);
    expect(find("  ")).toHaveLength(3);
    expect(find("nothing like it")).toEqual([]);
  });
});

describe("looking up missing Instagram accounts without paying twice", () => {
  it("picks businesses with no Instagram and leaves alone the ones searched for lately", () => {
    const rows = [
      row({ id: "a" }),
      row({ id: "b", instagram: ig("joesroofing") }),
      row({ id: "c", igSearchedAt: NOW - 3 * DAY }),
      row({ id: "d", igSearchedAt: NOW - IG_SEARCH_REST_MS - 1 }),
      row({ id: "e", status: "rejected" }),
      row({ id: "f", business: "  " }),
      row({ id: "g", instagram: ig("popular") }), // junk on file counts as none
    ];
    const all = igFinderTargets(rows, undefined, NOW);
    expect(all.targets.map((r) => r.id)).toEqual(["a", "d", "g"]);
    expect(all.rested).toBe(1);
    // a hand-picked selection may include a rejected business, but still not a rested one
    const some = igFinderTargets(rows, new Set(["a", "c", "e"]), NOW);
    expect(some.targets.map((r) => r.id)).toEqual(["a", "e"]);
    expect(some.rested).toBe(1);
  });
  it("remembers a paid search, found or not, and tells the server not to repeat it", () => {
    const result = { id: "x", email: "", phone: "", website: "", source: "", sourceUrl: "" };
    const missed = mergeRawReveal(row({ id: "x" }), { ...result, instagramSearches: 1 }, NOW);
    expect(missed.instagram).toBeUndefined();
    expect(missed.igSearchedAt).toBe(NOW);
    expect(rawScanPerson(missed).igSearched).toBe(true);
    // the free sources finding nothing is not a search
    expect(mergeRawReveal(row({ id: "x" }), { ...result, instagramSearches: 0 }, NOW).igSearchedAt).toBeUndefined();
    expect(mergeRawReveal(row({ id: "x" }), result, NOW).igSearchedAt).toBeUndefined(); // an older server says nothing
    expect(rawScanPerson(row()).igSearched).toBeUndefined();
    // junk from an older scan is not saved
    expect(mergeRawReveal(row({ id: "x" }), { ...result, instagram: ig("popular"), instagramSure: true }).instagram).toBeUndefined();
  });
  it("sums a run up in one line", () => {
    expect(igFinderSummary({ looked: 40, found: 12, searches: 31, searchedFor: 29 })).toBe("Found 12 Instagram accounts for 40 businesses · 31 searches used for 29 of them.");
    expect(igFinderSummary({ looked: 1, found: 1, searches: 0, searchedFor: 0 })).toBe("Found 1 Instagram account for 1 business · no search was used.");
    expect(igFinderSummary({ looked: 3, found: 0, searches: 3, searchedFor: 3 }, true)).toBe("Stopped. No Instagram found for these 3 businesses · 3 searches used for 3 of them.");
  });
});
