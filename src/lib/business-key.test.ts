import { describe, expect, it } from "vitest";
import { businessKey, cleanDomain, isCompanyDomain, legacyBusinessKey, normCompany, phoneKey } from "./business-key";
import { hideSeenBusinesses, rememberBusinesses } from "./seen-businesses";

describe("one identity per business", () => {
  it("uses the company's own domain, ignoring www, paths and ports", () => {
    expect(cleanDomain("https://www.SummitRoofing.com/contact?x=1")).toBe("summitroofing.com");
    expect(businessKey({ company: "Summit Roofing", website: "summitroofing.com" })).toBe("summitroofing.com");
  });
  it("never treats Facebook, Yelp or Gmail as one company", () => {
    expect(isCompanyDomain("facebook.com")).toBe(false);
    expect(isCompanyDomain("m.facebook.com")).toBe(false);
    expect(isCompanyDomain("gmail.com")).toBe(false);
    expect(isCompanyDomain("joes-roofing.business.site")).toBe(true);
    const a = businessKey({ company: "Joe's Roofing", website: "facebook.com/joesroofing", phone: "(303) 555-0142" });
    const b = businessKey({ company: "Mile High Gutters", website: "https://www.facebook.com/milehigh", phone: "720 555 0100" });
    expect(a).not.toBe(b);
    expect(legacyBusinessKey({ company: "Joe's Roofing", website: "facebook.com/joesroofing" })).toBe("");
  });
  it("matches the same business written differently by different sources", () => {
    expect(normCompany("Joe's Roofing, LLC")).toBe(normCompany("Joes Roofing"));
    expect(phoneKey("+1 (303) 555-0142")).toBe(phoneKey("303-555-0142"));
    expect(businessKey({ company: "Joe's Roofing, LLC", phone: "+1 (303) 555-0142" })).toBe(
      businessKey({ company: "Joes Roofing", phone: "303.555.0142" }),
    );
  });
});

describe("Only new", () => {
  function fakeDb(rows: { seen?: { key: string; first_seen_at: string }[]; leads?: string[]; suppressed?: string[] }) {
    const upserts: Record<string, unknown>[][] = [];
    const inList = (q: string, col: string) =>
      (new RegExp(`${col}=in\\.\\(([^)]*)\\)`).exec(q)?.[1] ?? "").split(",").map((x) => x.replace(/^"|"$/g, ""));
    return {
      upserts,
      async select(table: string, q: string) {
        if (table === "seen_businesses") return (rows.seen ?? []).filter((r) => inList(q, "key").includes(r.key));
        if (table === "leads") return (rows.leads ?? []).filter((d) => inList(q, "domain").includes(d)).map((domain) => ({ domain }));
        if (table === "suppressions") return (rows.suppressed ?? []).filter((d) => inList(q, "domain").includes(d)).map((domain) => ({ domain }));
        return [];
      },
      async upsert(_t: string, list: Record<string, unknown>[]) {
        upserts.push(list);
        return list;
      },
    };
  }
  const old = new Date(Date.now() - 86400e3).toISOString();
  const justNow = new Date().toISOString();
  const since = new Date(Date.now() - 60_000).toISOString();

  it("hides what an earlier scan returned, keeps what this scan found itself", async () => {
    const db = fakeDb({ seen: [{ key: "old.com", first_seen_at: old }, { key: "fresh.com", first_seen_at: justNow }] });
    const list = [{ company: "Old", website: "old.com" }, { company: "Fresh", website: "fresh.com" }, { company: "New", website: "new.com" }];
    const { kept, notes } = await hideSeenBusinesses(db as never, list, { hideSeen: true, since });
    expect(kept.map((b) => b.website)).toEqual(["fresh.com", "new.com"]);
    expect(notes.join(" ")).toMatch(/1 seen before/);
  });
  it("still recognises businesses remembered under the old key, and existing leads", async () => {
    const db = fakeDb({ seen: [{ key: "bobs plumbing|13035550100", first_seen_at: old }], leads: ["lead.com"] });
    const list = [{ company: "Bobs Plumbing", phone: "+1 303 555 0100" }, { company: "Lead Co", website: "lead.com" }, { company: "Other", website: "other.com" }];
    const { kept } = await hideSeenBusinesses(db as never, list, { hideSeen: true, since });
    expect(kept.map((b) => b.company)).toEqual(["Other"]);
  });
  it("blacklists real company domains only", async () => {
    const db = fakeDb({ suppressed: ["bounced.com", "facebook.com"] });
    const list = [{ company: "B", website: "bounced.com" }, { company: "F", website: "facebook.com/fpage" }];
    const { kept } = await hideSeenBusinesses(db as never, list, { hideSeen: false });
    expect(kept.map((b) => b.company)).toEqual(["F"]);
  });
  it("remembers each business once, without Facebook as its domain", async () => {
    const db = fakeDb({});
    await rememberBusinesses(db as never, [
      { company: "A", website: "a.com" },
      { company: "A again", website: "https://www.a.com/" },
      { company: "F", website: "facebook.com/f", phone: "3035550199" },
    ]);
    expect(db.upserts[0]).toHaveLength(2);
    expect(db.upserts[0].find((r) => String(r.key).startsWith("f|"))?.domain).toBeNull();
  });
});
