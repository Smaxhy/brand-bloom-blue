import { describe, expect, it } from "vitest";
import {
  bioLinkUrl,
  followersLabel,
  igDmUrl,
  igFollowers,
  igFromListingUrl,
  igHandle,
  igResultsHaveProfiles,
  igSearchName,
  igSearchWorthIt,
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
  it("never takes one of Instagram's own pages, a template's blank or a tool's account for a business", () => {
    for (const u of [
      // Instagram's landing page for a search phrase: the "@popular" that used to turn up on business after business
      "https://www.instagram.com/popular/tree-service-albuquerque/",
      "https://www.instagram.com/popular/joes-roofing-denver/?hl=en",
      "instagram.com/hashtag/roofing",
      "https://www.instagram.com/search/?q=joes",
      "https://www.instagram.com/a/r/?effect=1", // short links
      "https://www.instagram.com/s/aGlnaGxpZ2h0",
      // what a website template leaves behind
      "https://www.instagram.com/your_username",
      "https://www.instagram.com/yourbusinessname/",
      "https://instagram.com/your.handle.here",
      "https://www.instagram.com/company_name",
      "https://www.instagram.com/xxxx",
      "https://www.instagram.com/test12",
      // feed widgets, site builders and directories
      "https://www.instagram.com/elfsight",
      "https://www.instagram.com/smashballoon/",
      "https://www.instagram.com/housecallpro",
      "https://www.instagram.com/thumbtack",
      "https://www.instagram.com/followus",
    ])
      expect(igHandle(u), u).toBe("");
    // …while real names that merely start the same way are left alone
    for (const h of ["popular_roofing", "yourtreeguy", "yourhomeshop", "urbanstore", "testamenttrees", "demolition_pros", "abc"])
      expect(igHandle(`https://www.instagram.com/${h}/`), h).toBe(h);
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
  it("a lone link on one page of several, to an account named nothing like them, is worth a look first", () => {
    const badge = '<a href="https://www.instagram.com/gaf_roofing/">Certified installer</a>';
    const pick = pickSiteInstagram([page("<p>Welcome</p>"), page(badge, "/about"), page("<p>Call us</p>", "/contact")], joe);
    expect(pick?.handle).toBe("gaf_roofing");
    expect(pick?.confidence).toBe("likely");
    expect(pick?.why).toMatch(/check it's theirs/);
    // the same link in the footer of every page is their own social icon
    expect(pickSiteInstagram([page(badge), page(badge, "/about"), page(badge, "/contact")], joe)?.confidence).toBe("sure");
  });
  it("still recognises the handle when the listing name carries keywords after it", () => {
    const stuffed = { name: "Joe's Roofing | Roof Repair & Replacement Denver", domain: "" };
    const pick = pickSiteInstagram([page('<a href="https://www.instagram.com/joesroofing/">ig</a><a href="https://www.instagram.com/colorado_home_show/">seen at</a>')], stuffed);
    expect(pick?.handle).toBe("joesroofing");
    expect(pick?.why).toMatch(/handle matches the business name/);
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
  it("Instagram's landing page for the search phrase is never the account", () => {
    // Its title repeats whatever was searched for, so it used to look like a perfect match, on business after business.
    const popular = { link: "https://www.instagram.com/popular/joes-roofing-denver/", title: "Joes Roofing Denver", snippet: "Joe's Roofing Denver. Discover photos and videos about joes roofing denver on Instagram." };
    expect(pickSearchInstagram([popular], joe)).toBeNull();
    // any other page of Instagram's that names no account and shows no numbers is skipped the same way
    const unknown = { link: "https://www.instagram.com/trending_now/", title: "Joe's Roofing Denver | Instagram", snippet: "Posts about Joe's Roofing in Denver" };
    expect(pickSearchInstagram([unknown], joe)).toBeNull();
    // the real profile right below it is still found
    expect(pickSearchInstagram([popular, profile("joesroofingco", "Joe's Roofing", "Denver's family roofer")], joe)?.handle).toBe("joesroofingco");
  });
  it("somebody else's post that mentions them is not their account", () => {
    const customer = { link: "https://www.instagram.com/happy.homeowner/p/Cxyz/", title: "Sarah K on Instagram: \"New roof by Joe's Roofing, call them on 303-555-0142\"", snippet: "Thanks Joe's Roofing Denver! joesroofing.com" };
    expect(pickSearchInstagram([customer], joe)).toBeNull();
    const supplier = { link: "https://www.instagram.com/reel/Cabc/", title: "GAF Roofing (@gaf_roofing) • Instagram reel", snippet: "Installer of the month: Joe's Roofing, Denver (303) 555-0142" };
    expect(pickSearchInstagram([supplier], joe)).toBeNull();
    // their own post is fine: the poster carries the name
    const own = { link: "https://www.instagram.com/joesroofingdenver/p/Cdef/", title: "Joe's Roofing on Instagram: \"Another roof done\"", snippet: "Denver, Colorado" };
    expect(pickSearchInstagram([own], joe)).toMatchObject({ handle: "joesroofingdenver", confidence: "sure" });
  });
  it("a national brand with a similar name is not the local business", () => {
    const brand = profile("joesroofing", "Joe's Roofing", "America's roofing channel", "812K");
    expect(pickSearchInstagram([brand], joe)).toBeNull();
    // unless its bio really is theirs
    expect(pickSearchInstagram([profile("joesroofing", "Joe's Roofing", "joesroofing.com", "812K")], joe)?.confidence).toBe("sure");
  });
  it("their website counts only when it is really theirs", () => {
    // another domain that merely ends the same way
    expect(pickSearchInstagram([profile("mile_high_roofs", "Mile High Roofs", "visit bestjoesroofing.com")], joe)).toBeNull();
    // an email address at their domain is theirs
    expect(pickSearchInstagram([profile("mile_high_roofs", "Mile High Roofs", "office@joesroofing.com")], joe)?.confidence).toBe("sure");
    // a Facebook page given as the "website" proves nothing
    const fbOnly = { name: "Joe's Roofing", domain: "facebook.com", city: "Denver" };
    expect(pickSearchInstagram([profile("mile_high_roofs", "Mile High Roofs", "find us on facebook.com")], fbOnly)).toBeNull();
  });
  it("matches a listing name that carries keywords or a legal form", () => {
    const stuffed = { name: "Maven Tree Services, LLC - Tree Removal & Trimming", city: "Albuquerque, NM" };
    const pick = pickSearchInstagram([profile("maventreeservices", "Maven Tree Services", "Albuquerque tree care")], stuffed);
    expect(pick).toMatchObject({ handle: "maventreeservices", confidence: "sure" });
  });
  it("a search run for a whole state accepts the state as the place", () => {
    const maven = { name: "Maven Tree Services", city: "new mexico" };
    const hit = pickSearchInstagram([profile("maventreeservices", "Maven Tree Services", "Tree care · Albuquerque, NM")], maven);
    expect(hit).toMatchObject({ confidence: "sure" });
    expect(hit?.why).toMatch(/mentions new mexico/);
    expect(pickSearchInstagram([profile("maventreeservices", "Maven Tree Services", "Proudly serving New Mexico")], maven)?.confidence).toBe("sure");
    // two capital letters in the middle of a sentence are not a state
    const maine = { name: "North Star Outfitters", city: "Maine" };
    expect(pickSearchInstagram([profile("northstaroutfitters", "North Star Outfitters", "CALL ME for gear. Bozeman")], maine)?.confidence).toBe("likely");
    expect(pickSearchInstagram([profile("northstaroutfitters", "North Star Outfitters", "Gear shop in Portland, ME 04101")], maine)?.confidence).toBe("sure");
    // a country is no place at all
    expect(pickSearchInstagram([profile("northstaroutfitters", "North Star Outfitters", "Shipping across the USA")], { name: "North Star Outfitters", city: "USA" })?.confidence).toBe("likely");
  });
  it("an account turned down by hand is not offered again", () => {
    const hit = profile("joesroofing", "Joe's Roofing", "Denver roofer");
    expect(pickSearchInstagram([hit], joe)?.handle).toBe("joesroofing");
    expect(pickSearchInstagram([hit], joe, { not: ["https://www.instagram.com/joesroofing"] })).toBeNull();
  });
  it("on a page listing several accounts, takes the one that fits the name", () => {
    const directory = { link: "https://denverroofers.example/list", title: "Roofers in Denver", snippet: "instagram.com/eliteroofingdenver · instagram.com/joesroofingdenver · instagram.com/topnotchroofs" };
    expect(pickSearchInstagram([directory], joe)?.handle).toBe("joesroofingdenver");
    // their phone next to somebody else's account is not enough
    const mixed = { link: "https://denverroofers.example/list", title: "Roofers in Denver", snippet: "Elite Roofing instagram.com/eliteroofingdenver · Joe's Roofing (303) 555-0142" };
    expect(pickSearchInstagram([mixed], joe)).toBeNull();
  });
  it("knows whether a search answered with profiles at all", () => {
    expect(igResultsHaveProfiles([profile("someoneelse", "Other Biz", "hello")])).toBe(true);
    expect(igResultsHaveProfiles([])).toBe(false);
    expect(igResultsHaveProfiles([
      { link: "https://www.instagram.com/p/Cxyz/", title: "Instagram post", snippet: "" },
      { link: "https://www.instagram.com/popular/roofers-denver/", title: "Roofers Denver", snippet: "" },
      { link: "https://www.yelp.com/biz/joes", title: "Joe's", snippet: "" },
    ])).toBe(false);
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
  it("searches for the name as people write it", () => {
    expect(igSearchName("Joe's Roofing LLC")).toBe("Joe's Roofing");
    expect(igSearchName("Joe's Roofing, L.L.C.")).toBe("Joe's Roofing");
    expect(igSearchName("Joe's Roofing | Roof Repair & Replacement Denver")).toBe("Joe's Roofing");
    expect(igSearchName("Joe's Roofing - Denver Roofers")).toBe("Joe's Roofing");
    expect(igSearchName("Maven Tree Services Inc. (Albuquerque)")).toBe("Maven Tree Services");
    expect(igSearchName("Dakwerken Peeters BV")).toBe("Dakwerken Peeters");
    // not cut where the cut would lose the name
    expect(igSearchName("A-1 Tree Service")).toBe("A-1 Tree Service");
    expect(igSearchName("Tree Service | Maven")).toBe("Tree Service | Maven");
    expect(igSearchName("Casa Linda")).toBe("Casa Linda");
    expect(igSearchName("The Tree Company")).toBe("The Tree Company");
  });
  it("asks Instagram first, and words the question without the legal form or a repeated town", () => {
    expect(igSearchQueries(joe)).toEqual(["site:instagram.com Joe's Roofing Denver", "Joe's Roofing Denver instagram"]);
    expect(igSearchQueries({ name: "Joe's Roofing Denver | Roofers", city: "Denver, CO" })).toEqual(["site:instagram.com Joe's Roofing Denver", "Joe's Roofing Denver instagram"]);
    expect(igSearchQueries({ name: "Maven Tree Services", city: "new mexico" })[0]).toBe("site:instagram.com Maven Tree Services new mexico");
    expect(igSearchQueries({ name: "Maven Tree Services", city: "USA" })[0]).toBe("site:instagram.com Maven Tree Services");
    expect(igSearchQueries({ name: "" })).toEqual([]);
  });
  it("doesn't spend a search on a name nothing could be recognised by", () => {
    expect(igSearchWorthIt({ name: "Tree Service", city: "Denver" })).toBe(false);
    expect(igSearchWorthIt({ name: "Roofing Pros LLC" })).toBe(false);
    expect(igSearchWorthIt({ name: "Tree Service", phone: "(303) 555-0142" })).toBe(true);
    expect(igSearchWorthIt({ name: "Roofing Pros", domain: "roofingprosdenver.com" })).toBe(true);
    expect(igSearchWorthIt({ name: "Maven Tree Services" })).toBe(true);
    expect(igSearchWorthIt({ name: "" })).toBe(false);
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
