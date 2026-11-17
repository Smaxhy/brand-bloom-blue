import { describe, expect, it } from "vitest";
import reelsHtml from "../inspirova-reels.html?raw";

/* The homepage video section is plain script inside the homepage document. Its link handling sits in one
   marked block that never touches the page, so that block is run here exactly as visitors get it. */
interface Links {
  code: string;
  page: string;
  embed: string;
}
interface Reels {
  REELS: string[];
  LOAD: string;
  code(url: unknown): string;
  links(url: unknown): Links | null;
  list(urls: unknown[]): Links[];
  frameHeight(width: number): number;
}

const block = /\/\*<rl-logic>\*\/([\s\S]*?)\/\*<\/rl-logic>\*\//.exec(reelsHtml);
const scope: { InspReels?: Reels } = {};
new Function("window", block?.[1] ?? "")(scope);
const R = scope.InspReels as Reels;

describe("homepage videos", () => {
  it("shows the three reels that were asked for, loaded when the section comes into view", () => {
    expect(block).not.toBeNull();
    expect(R.list(R.REELS).map((r) => r.code)).toEqual([
      "DYHX6UOoBhO",
      "DX6po0uoIZS",
      "DRVU9kgCOTA",
    ]);
    expect(["view", "tap"]).toContain(R.LOAD);
  });
  it("reads the code from any kind of Instagram link and drops the share and tracking parts", () => {
    expect(R.links("https://www.instagram.com/reel/DYHX6UOoBhO/?srtk=YnI2N3B3NjhxeWxx")).toEqual({
      code: "DYHX6UOoBhO",
      page: "https://www.instagram.com/reel/DYHX6UOoBhO/",
      embed: "https://www.instagram.com/reel/DYHX6UOoBhO/embed/",
    });
    expect(R.code("https://www.instagram.com/reel/DX6po0uoIZS/?cplk=MXFsYnFxa3F4dzdrOA==")).toBe(
      "DX6po0uoIZS",
    );
    expect(R.code("https://instagram.com/reels/DRVU9kgCOTA")).toBe("DRVU9kgCOTA");
    expect(R.code("  http://www.instagram.com/p/C_a-b12345/#x ")).toBe("C_a-b12345");
    expect(R.code("https://www.instagram.com/inspirova/reel/DRVU9kgCOTA/?igsh=abc")).toBe(
      "DRVU9kgCOTA",
    );
  });
  it("refuses anything that is not a link to an Instagram video or post", () => {
    for (const bad of [
      "",
      null,
      undefined,
      42,
      "DYHX6UOoBhO",
      "https://www.instagram.com/inspirova/",
      "https://www.instagram.com/reel/",
      "https://evil.example/instagram.com/reel/DYHX6UOoBhO/",
      "https://www.instagram.com.evil.example/reel/DYHX6UOoBhO/",
      "javascript:alert(1)//instagram.com/reel/DYHX6UOoBhO/",
      'https://www.instagram.com/reel/abc"><script>/',
      "https://www.instagram.com/reel/a b c d e/",
    ]) {
      expect(R.code(bad), String(bad)).toBe("");
      expect(R.links(bad), String(bad)).toBeNull();
    }
  });
  it("lists each video once and skips broken links", () => {
    expect(
      R.list([
        "https://www.instagram.com/reel/DYHX6UOoBhO/",
        "nope",
        "https://instagram.com/reel/DYHX6UOoBhO/?x=1",
        "https://www.instagram.com/p/DX6po0uoIZS/",
      ]).map((r) => r.embed),
    ).toEqual([
      "https://www.instagram.com/reel/DYHX6UOoBhO/embed/",
      "https://www.instagram.com/reel/DX6po0uoIZS/embed/",
    ]);
    expect(R.list([])).toEqual([]);
  });
  it("gives a frame room for an upright video plus Instagram's header and footer", () => {
    expect(R.frameHeight(348)).toBe(845);
    expect(R.frameHeight(326)).toBeGreaterThan((326 * 16) / 9);
  });
});

describe("homepage videos: the file itself", () => {
  it("can be placed inside the homepage document without closing it early", () => {
    expect(reelsHtml).not.toMatch(/<\/body>|<\/html>/i);
    expect((reelsHtml.match(/<script>/g) ?? []).length).toBe(
      (reelsHtml.match(/<\/script>/g) ?? []).length,
    );
  });
  it("only ever points at instagram.com and adds no script from outside", () => {
    const hosts = [...reelsHtml.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) =>
      m[1].toLowerCase(),
    );
    expect(hosts.length).toBeGreaterThan(3);
    for (const h of hosts) expect(["www.instagram.com", "instagram.com"]).toContain(h);
    expect(reelsHtml).not.toMatch(
      /<script[^>]+src=|embed\.js|fbq\(|gtag\(|document\.cookie|localStorage/,
    );
  });
  it("keeps every style rule under its own prefix", () => {
    const css = /<style>([\s\S]*?)<\/style>/.exec(reelsHtml)?.[1] ?? "";
    const selectors = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "")
      .replace(/@media[^{]+\{/g, "")
      .split("}")
      .map((rule) => rule.split("{")[0].trim())
      .filter(Boolean);
    expect(selectors.length).toBeGreaterThan(15);
    for (const group of selectors)
      for (const sel of group.split(",")) expect(sel.trim(), sel).toMatch(/^\.rl/);
  });
});
