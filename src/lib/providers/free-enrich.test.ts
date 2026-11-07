import { afterEach, expect, it, vi } from "vitest";
import { hasMx } from "./free-enrich";
afterEach(() => vi.unstubAllGlobals());
it("treats DNS failure as unknown rather than claiming no mail server", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ Status: 2 })));
  expect(await hasMx("business.test")).toBeNull();
});
it("keeps authoritative NXDOMAIN as absent", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ Status: 3 })));
  expect(await hasMx("business.test")).toBe(false);
});