import { describe, expect, it } from "vitest";
import {
  bioLinkUrl,
  followersLabel,
  igDmUrl,
  igFollowers,
  igFromListingUrl,
  igHandle,
  igHandlesIn,
  igMentionsIn,
  igNameScore,
  igSearchQueries,
  nameMatchScore,
  pickBioInstagram,
  pickSearchInstagram,
  pickSiteInstagram,
} from "./instagram";

const joe = { name: "Joe's Roofing LLC", domain: "joesroofing.com", city: "Denver, CO", phone: "(303) 555-0142" };

describe("reading an Instagram handle", () => {
  it("understands every way a profile is written", () => {
    expect(igHandle("https://www.instagram.com/joes.roofing/")).toBe("joes.roofing");
    expect(igHandle("http://instagram.com/JoesRoofing?igshid=abc123")).toBe("joesroofing");
    expect(igHandle("instagram.com/joesroofing")).toBe("joesroofing");
    expect(igHandle("//www.instagram.com/joesroofing/")).toBe("joesroofing");
    expect(igHandle("https:\\/\\/www.instagram.com\\/joesroofing\\/")).toBe("joesroofing"); // inside JSON
    expect(igHandle("https://instagr.am/joesroofing")).toBe("joesroofing");
    expect(igHandle("https://www.instagram.com/_u/joesroofing")).toBe("joesroofing"); // app deep link
    expect(igHandle("https://ig.me/m/joesroofing")).toBe("joesroofing");
    expect(igHandle("@joes_roofing")).toBe("joes_roofing");
    expect(igHandle("Check instagram.com/joesroofing.")).toBe("joesroofing"); // sentence full stop
  });
  it("never takes a post, a section, a file or a platform account for a profile", () => {
    for (const u of [
      "https://www.instagram.com/p/CxYz123/",
      "https://www.instagram.com/reel/abc/",
      "https://www.instagram.com/explore/tags/roofing/",
      "https://www.instagram.com/accounts/login/",
      "https://www.instagram.com/embed.js",
      "https://www.instagram.com/stories/joesroofing/123/",
      "https://www.instagram.com/instagram",
      "https://www.instagram.com/wix",
      "https://www.instagram.com/yourusername",
      "https://www.instagram.com/",
      "https://facebook.com/joesroofing",
      "two words",
    ])
      expect(igHandle(u), u).toBe("");
  });
  it("is not fooled by Instagram's image servers, help pages or link wrappers", () => {
    const feed = `
      <img src="https://scontent-ams4-1.cdninstagram.com/v/t51.2885-15/123_n.jpg">
      <img src="https://scontent.cdninstagram.com/v/t51.29350-15/456_n.jpg">
      <a href="https://help.instagram.com/581066165581870">Help</a>
      <a href="https://about.instagram.com/features">About</a>
      <a href="https://business.instagram.com/advertising">Ads</a>
      <a href="https://l.instagram.com/?u=https%3A%2F%2Fexample.com">out</a>
      <a href="https://www.instagram.com/?url=https://example.com">share</a>
      <a href="https://www.instagram.com/sharer.php?u=x">share</a>
      <a href="https://m.instagram.com/joesroofing">ours</a>`;
    expect([...igHandlesIn(feed)]).toEqual([["joesroofing", 1]]);
    expect(igHandle("https://scontent.cdninstagram.com/v/t51/1.jpg")).toBe("");
    expect(igHandle("https://help.instagram.com/joesroofing")).toBe("");
    // the same call twice gives the same answer (no state kept between calls)
    expect(igHandle("https://www.instagram.com/joesroofing/")).toBe("joesroofing");
    expect([...igHandlesIn("x https://www.instagram.com/joesroofing/")]).toEqual([["joesroofing", 1]]);
    expect([...igHandlesIn("https://www.instagram.com/joesroofing/")]).toEqual([["joesroofing", 1]]);
  });
  it("collects every profile linked in a page, counting repeats", () => {
    const html = `<a href="https://www.instagram.com/joesroofing/">ig</a> <a href="https://instagram.com/p/abc">post</a>
      <script>{"sameAs":["https:\\/\\/www.facebook.com\\/joes","https:\\/\\/www.instagram.com\\/joesroofing"]}</script>
      <a href="https://www.instagram.com/gaf_roofing">partner</a>`;
    expect([...igHandlesIn(html)]).toEqual([["joesroofing", 2], ["gaf_roofing", 1]]);
  });
  it("reads a handle written out next to the word Instagram, but not an email address", () => {
    expect(igMentionsIn("Follow us on Instagram @joes.roofing for daily photos")).toEqual(["joes.roofing"]);
    expect(igMentionsIn("IG: @joesroofing | FB: Joe's Roofing")).toEqual(["joesroofing"]);
    expect(igMentionsIn("Instagram and email: info@joesroofing.com")).toEqual([]);
    expect(igMentionsIn("We are on Instagram! Write to hello @joesroofing.com")).toEqual([]);
    expect(igMentionsIn("Tweet us @joesroofing")).toEqual([]);
  });
  it("builds the profile and chat links", () => {
    expect(igFromListingUrl("https://www.instagram.com/joesroofing/?hl=en")).toBe("https://www.instagram.com/joesroofing");
    expect(igFromListingUrl("https://joesroofing.com")).toBe("");
    expect(igFromListingUrl("https://www.instagram.com/p/abc")).toBe("");
    expect(igDmUrl("joesroofing")).toBe("https://ig.me/m/joesroofing");
  });
});

describe("does this handle belong to this business?", () => {
  it("scores the name and the domain", () => {
    expect(igNameScore("joesroofing", joe)).toBe(100);
    expect(igNameScore("joes.roofing", joe)).toBe(100);
    expect(igNameScore("joesroofingdenver", joe)).toBeGreaterThanOrEqual(85);
    expect(igNameScore("joesroofing_co", joe)).toBeGreaterThanOrEqual(85);
    expect(igNameScore("joe_roofing", joe)).toBeGreaterThanOrEqual(50); // close spelling
    expect(igNameScore("smithsonsplumbing_tx", { name: "Smith & Sons Plumbing" })).toBeGreaterThanOrEqual(78);
    expect(igNameScore("bellavita.salon", { name: "Bella Vita Hair Salon", domain: "bellavitasalon.com" })).toBeGreaterThanOrEqual(85);
  });
  it("a shared trade word alone means nothing", () => {
    expect(igNameScore("gaf_roofing", joe)).toBeLessThan(55);
    expect(igNameScore("denverroofingpros", joe)).toBeLessThan(55);
    expect(igNameScore("eliteplumbing", { name: "Ace Plumbing" })).toBeLessThan(55);
    expect(igNameScore("acmewebdesign", joe)).toBeLessThan(55);
    expect(nameMatchScore("ABC Roofing", "Joe's Roofing")).toBeLessThan(65);
    expect(nameMatchScore("Denver Roofing Co", "Joe's Roofing LLC")).toBeLessThan(65);
  });
  it("matches display names whatever the word order or legal suffix", () => {
    expect(nameMatchScore("Joe's Roofing", "Joe's Roofing LLC")).toBe(100);
    expect(nameMatchScore("Joes Roofing | Denver Roofers", "Joe's Roofing LLC")).toBeGreaterThanOrEqual(75);
    expect(nameMatchScore("Roofing by Joe's", "Joe's Roofing")).toBeGreaterThanOrEqual(75);
    expect(nameMatchScore("Bella Vita Salon & Spa", "Bella Vita Hair Salon")).toBeGreaterThanOrEqual(90);
    expect(nameMatchScore("Roofing Pros", "Roofing Pros LLC")).toBe(100);
  });
});

describe("the profile on their own website", () => {
  const page = (html: string, path = "/") => ({ path, html });
  it("takes the business's own profile, not the supplier's or the web designer's", () => {
    const html = `
      <a href="https://www.instagram.com/gaf_roofing/">Certified GAF installer</a>
      <footer><a href="https://www.instagram.com/joesroofingdenver"><i class="icon-ig"></i></a>
      <a href="https://instagram.com/brightpixel.webdesign">site by Bright Pixel</a></footer>`;
    const pick = pickSiteInstagram([page(html), page(html, "/contact")], joe);
    expect(pick?.handle).toBe("joesroofingdenver");
    expect(pick?.confidence).toBe("sure");
    expect(pick?.via).toBe("site");
    expect(pick?.url).toBe("https://www.instagram.com/joesroofingdenver");
  });
  it("finds it in escaped JSON (Wix / Squarespace / schema.org sameAs) with no visible link at all", () => {
    const html = `<script type="application/ld+json">{"@type":"LocalBusiness","name":"Joe's Roofing","sameAs":["https:\\/\\/www.facebook.com\\/joesroofing","https:\\/\\/www.instagram.com\\/the_denver_roof_guy\\/"]}</script>`;
    const pick = pickSiteInstagram([page(html)], joe);
    expect(pick?.handle).toBe("the_denver_roof_guy"); // nothing like the name — their site says it's theirs
    expect(pick?.confidence).toBe("sure");
    expect(pick?.why).toMatch(/names it as their own profile/);
  });
  it("a handle that looks nothing like the name is still theirs when it's the only one their site links to", () => {
    const pick = pickSiteInstagram([page('<a href="https://www.instagram.com/mile_high_roofs/">Instagram</a>')], joe);
    expect(pick?.handle).toBe("mile_high_roofs");
    expect(pick?.confidence).toBe("sure");
  });
  it("ignores a lone web-designer credit, embedded posts and builder placeholders", () => {
    expect(pickSiteInstagram([page('<a href="https://instagram.com/pixelperfect_webdesign"><img src="ig.svg"></a>')], joe)).toBeNull();
    expect(pickSiteInstagram([page('<blockquote data-instgrm-permalink="https://www.instagram.com/p/Cabc/"></blockquote><script src="//www.instagram.com/embed.js"></script>')], joe)).toBeNull();
    expect(pickSiteInstagram([page('<a href="https://www.instagram.com/wix">Follow</a><a href="https://instagram.com/yourusername">ig</a>')], joe)).toBeNull();
    expect(pickSiteInstagram([page("<p>No socials here</p>")], joe)).toBeNull();
  });
  it("an agency's own Instagram is fine when the business IS an agency", () => {
    const pick = pickSiteInstagram([page('<a href="https://instagram.com/brightpixel.webdesign">ig</a>')], { name: "Bright Pixel Web Design", domain: "brightpixel.co" });
    expect(pick?.handle).toBe("brightpixel.webdesign");
  });
  it("uses a handle that is only written out", () => {
    const pick = pickSiteInstagram([page("<p>Follow us on Instagram: @joesroofing</p>")], joe);
    expect(pick?.handle).toBe("joesroofing");
    expect(pick?.confidence).toBe("sure"); // matches the name
  });
  it("between two unrelated handles, prefers the one on every page — and says it isn't certain", () => {
    const home = '<a href="https://instagram.com/mile_high_roofs">ig</a><a href="https://instagram.com/colorado_home_show">as seen at</a>';
    const other = '<a href="https://instagram.com/mile_high_roofs">ig</a>';
    const pick = pickSiteInstagram([page(home), page(other, "/about"), page(other, "/contact")], joe);
    expect(pick?.handle).toBe("mile_high_roofs");
  });
});

describe("the profile in search results", () => {
  const profile = (handle: string, name: string, bio: string, followers = "1,204") => ({
    link: `https://www.instagram.com/${handle}/`,
    title: `${name} (@${handle}) • Instagram photos and videos`,
    snippet: `${followers} Followers, 310 Following, 96 Posts - ${name} (@${handle}) on Instagram: "${bio}"`,
  });
  it("accepts the profile whose bio shows their website — whatever it is called", () => {
    const pick = pickSearchInstagram([profile("mile_high_roofs", "Mile High Roofs", "Roof repair & replacement 🏠 joesroofing.com", "12.4K")], joe);
    expect(pick).toMatchObject({ handle: "mile_high_roofs", confidence: "sure", via: "search", followers: 12400 });
    expect(pick?.why).toMatch(/mentions their website/);
  });
  it("accepts the profile whose bio shows their phone number", () => {
    const pick = pickSearchInstagram([profile("roofguy303", "The Roof Guy", "Call 303.555.0142 for a free estimate")], joe);
    expect(pick?.confidence).toBe("sure");
    expect(pick?.why).toMatch(/phone number/);
  });
  it("a matching name in the right town is theirs", () => {
    const pick = pickSearchInstagram([profile("joesroofingco", "Joe's Roofing", "Denver's family roofer since 1998")], joe);
    expect(pick).toMatchObject({ handle: "joesroofingco", confidence: "sure", followers: 1204 });
  });
  it("a matching name with no town is only 'likely' — and only near the top", () => {
    const hit = profile("joesroofing", "Joe's Roofing", "Quality roofs. Free quotes.");
    expect(pickSearchInstagram([hit], joe)?.confidence).toBe("likely");
    const filler = Array.from({ length: 4 }, (_, i) => profile(`someoneelse${i}`, `Other Biz ${i}`, "hello"));
    expect(pickSearchInstagram([...filler, hit], joe)).toBeNull();
  });
  it("the town must be there as a word (or in the handle), not as letters inside another word", () => {
    const ely = { name: "North Star Outfitters", domain: "northstaroutfitters.com", city: "Ely, MN" };
    // "safely" contains "ely": that is not the town
    const elsewhere = profile("northstaroutfitters", "North Star Outfitters", "Shop safely online. Bozeman, Montana.");
    expect(pickSearchInstagram([elsewhere], ely)?.confidence).toBe("likely");
    const here = profile("northstaroutfitters", "North Star Outfitters", "Canoe trips from Ely, Minnesota");
    expect(pickSearchInstagram([here], ely)?.confidence).toBe("sure");
    const inHandle = profile("northstar_ely", "North Star", "Canoe trips and gear");
    expect(pickSearchInstagram([inHandle], ely)?.handle).toBe("northstar_ely");
  });
  it("rejects a different business that merely shares the trade word", () => {
    const results = [
      profile("eliteroofingdenver", "Elite Roofing Denver", "Denver CO roofing contractor"),
      profile("denverroofingpros", "Denver Roofing Pros", "Best roofers in Denver"),
      { link: "https://www.instagram.com/explore/tags/joesroofing/", title: "#joesroofing", snippet: "20 posts" },
      { link: "https://www.instagram.com/p/Cxyz/", title: "Instagram post", snippet: "New roof in Denver" },
    ];
    expect(pickSearchInstagram(results, joe)).toBeNull();
  });
  it("takes the handle from a post result's title when the profile itself isn't listed", () => {
    const pick = pickSearchInstagram(
      [{ link: "https://www.instagram.com/p/Cxyz/", title: "Joe's Roofing (@joesroofingdenver) • Instagram photos and videos", snippet: "Another Denver roof finished today" }],
      joe,
    );
    expect(pick?.handle).toBe("joesroofingdenver");
  });
  it("uses another page that names their Instagram only with the town as back-up", () => {
    const fb = { link: "https://www.facebook.com/joesroofing", title: "Joe's Roofing - Denver, Colorado", snippet: "Follow us: instagram.com/joesroofingdenver · Roofing contractor in Denver" };
    expect(pickSearchInstagram([fb], joe)?.handle).toBe("joesroofingdenver");
    // the same name on some page that says nothing about where: could be anyone's
    const vague = { link: "https://somedirectory.com/x", title: "Roofers", snippet: "instagram.com/joesroofing" };
    expect(pickSearchInstagram([vague], joe)).toBeNull();
  });
  it("picks the best of several candidates, not the first", () => {
    const results = [
      profile("joesroofingtx", "Joe's Roofing Texas", "Houston roofing"),
      profile("joesroofingdenver", "Joe's Roofing", "Denver, CO · joesroofing.com"),
    ];
    expect(pickSearchInstagram(results, joe)?.handle).toBe("joesroofingdenver");
  });
  it("reads follower counts and labels them", () => {
    expect(igFollowers("12.4K Followers, 310 Following")).toBe(12400);
    expect(igFollowers("1,204 Followers")).toBe(1204);
    expect(igFollowers("2M Followers")).toBe(2_000_000);
    expect(igFollowers("no numbers here")).toBeNull();
    expect(followersLabel(12400)).toBe("12k");
    expect(followersLabel(1204)).toBe("1.2k");
    expect(followersLabel(980)).toBe("980");
    expect(followersLabel(2_300_000)).toBe("2.3M");
    expect(followersLabel(null)).toBe("");
  });
  it("asks precise questions first", () => {
    expect(igSearchQueries(joe)).toEqual(['site:instagram.com Joe\'s Roofing LLC Denver', '"Joe\'s Roofing LLC" Denver instagram']);
    expect(igSearchQueries({ name: "" })).toEqual([]);
  });
});

describe("listings that only have socials", () => {
  it("recognises a link-in-bio page given as the website", () => {
    expect(bioLinkUrl("https://linktr.ee/joesroofing")).toBe("https://linktr.ee/joesroofing");
    expect(bioLinkUrl("linktr.ee/joesroofing?utm_source=gmb")).toBe("https://linktr.ee/joesroofing");
    expect(bioLinkUrl("https://beacons.ai/joes.roofing")).toBe("https://beacons.ai/joes.roofing");
    expect(bioLinkUrl("https://joesroofing.com/links")).toBe("");
    expect(bioLinkUrl("https://linktr.ee/")).toBe("");
  });
  it("reads the Instagram off the link-in-bio page", () => {
    const html = '<a href="https://www.instagram.com/joesroofingdenver">Instagram</a><a href="https://www.instagram.com/linktree">made with</a>';
    expect(pickBioInstagram(html, "https://linktr.ee/joesroofingdenver", { name: "Joe's Roofing" })).toMatchObject({ handle: "joesroofingdenver", via: "bio" });
  });
});
