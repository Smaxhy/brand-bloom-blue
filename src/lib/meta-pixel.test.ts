import { describe, expect, it } from "vitest";
import inspirovaHtml from "../inspirova.html?raw";
import {
  META_PIXEL_BASE_CODE,
  META_PIXEL_ID,
  META_PIXEL_NOSCRIPT_SRC,
  isTrackedPath,
} from "./meta-pixel";

describe("Meta pixel", () => {
  it("tracks the public pages", () => {
    for (const path of ["/", "/results", "/privacy", "/a-page-that-does-not-exist"])
      expect(isTrackedPath(path)).toBe(true);
  });

  it("never tracks the admin area or the password reset", () => {
    for (const path of [
      "/admin",
      "/admin/",
      "/admin/outreach",
      "/reset-password",
      "/reset-password/x",
    ])
      expect(isTrackedPath(path)).toBe(false);
  });

  it("does not mistake a public page for a private one by its first letters", () => {
    expect(isTrackedPath("/administration-services")).toBe(true);
  });

  it("starts the pixel once with our ID and counts the page view", () => {
    expect(META_PIXEL_ID).toMatch(/^\d{10,20}$/);
    expect(META_PIXEL_BASE_CODE.match(/fbq\('init'/g)).toHaveLength(1);
    expect(META_PIXEL_BASE_CODE).toContain(`fbq('init', '${META_PIXEL_ID}')`);
    expect(META_PIXEL_BASE_CODE.match(/fbq\('track', 'PageView'\)/g)).toHaveLength(1);
    expect(META_PIXEL_NOSCRIPT_SRC).toBe(
      `https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`,
    );
  });

  it("sends a Lead from both public forms, and only after the server accepted the request", () => {
    // one helper, two callers: the quote request and the contact message
    expect(inspirovaHtml.match(/fb\("track","Lead"/g)).toHaveLength(1);
    expect(inspirovaHtml).toContain('window.__inspLead("Quote request")');
    expect(inspirovaHtml).toContain('window.__inspLead("Contact message")');
    const quote = inspirovaHtml.indexOf('window.__inspLead("Quote request")');
    const quoteOk = inspirovaHtml.lastIndexOf("if(!res.ok)", quote);
    expect(quoteOk).toBeGreaterThan(-1);
    expect(quote - quoteOk).toBeLessThan(400);
    const contact = inspirovaHtml.indexOf('window.__inspLead("Contact message")');
    const contactOk = inspirovaHtml.lastIndexOf("if(res.ok)", contact);
    expect(contactOk).toBeGreaterThan(-1);
    expect(contact - contactOk).toBeLessThan(400);
    // the public page never starts a pixel of its own: the framing page owns it
    expect(inspirovaHtml).not.toContain("fbevents.js");
    expect(inspirovaHtml).not.toContain("fbq('init'");
  });
});
