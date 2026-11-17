import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import siteHtml from "../inspirova.html?raw";
import homeRoute from "../routes/index.tsx?raw";
import privacyRoute from "../routes/privacy.tsx?raw";
import resultsRoute from "../routes/results.tsx?raw";

/* Phone browsers colour their own top and bottom bars from the page behind a full-screen public page.
   These checks keep that page the same colour as the page it frames, and aimed at elements that exist.
   The style sheet is read from disk because the test runner hands style sheets to tests as empty text. */
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("the page behind the public pages", () => {
  it("has the homepage's own dark colour behind the homepage and results frames", () => {
    const ink = /--ink:\s*(#[0-9A-Fa-f]{6})/.exec(siteHtml)?.[1] ?? "";
    const rule =
      /html:has\(iframe#main-content\),\s*html:has\(iframe#main-content\) body\s*\{\s*background:\s*(#[0-9A-Fa-f]{6});?\s*\}/.exec(
        css,
      );
    expect(ink).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(rule?.[1].toLowerCase()).toBe(ink.toLowerCase());
  });
  it("is aimed at the two frames that fill the screen", () => {
    for (const route of [homeRoute, resultsRoute])
      expect(route).toMatch(/<iframe[\s\S]*?id="main-content"/);
  });
  it("follows the privacy page's own background", () => {
    const token = /\.public-site\s*\{\s*--background:\s*([^;]+);/.exec(css)?.[1].trim();
    const rule =
      /html:has\(main\.public-site\),\s*html:has\(main\.public-site\) body\s*\{\s*background:\s*([^;}]+);?\s*\}/
        .exec(css)?.[1]
        .trim();
    expect(token).toBeTruthy();
    expect(rule).toBe(token);
    expect(privacyRoute).toMatch(/<main[^>]*className="public-site/);
  });
  it("leaves the account side alone", () => {
    expect(css).not.toMatch(/html:has\([^)]*\)\s*(body\s*)?\{[^}]*!important/);
    expect(css).toMatch(/body \{ background: var\(--background\);/);
  });
});
