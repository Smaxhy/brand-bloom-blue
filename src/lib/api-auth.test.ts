import { afterEach, describe, expect, it, vi } from "vitest";
import { getApiUser } from "./api-auth";

const env = { SUPABASE_URL: "https://auth.example.test", SUPABASE_PUBLISHABLE_KEY: "publishable-test" };
const request = () => new Request("https://site.test/api/diag", { headers: { Authorization: "Bearer test-token" } });
afterEach(() => vi.unstubAllGlobals());
describe("admin server authorization", () => {
  it.each([[], [{ role: "user" }]])("denies signed-in accounts without an explicit admin role: %j", async (roles) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ id: "user-id" })).mockResolvedValueOnce(Response.json(roles)));
    expect(await getApiUser(request(), env)).toBeNull();
  });
  it("denies access when role lookup fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ id: "user-id" })).mockResolvedValueOnce(new Response(null, { status: 503 })));
    expect(await getApiUser(request(), env)).toBeNull();
  });
  it("allows a verified CEO", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ id: "user-id" })).mockResolvedValueOnce(Response.json([{ role: "ceo" }])));
    expect(await getApiUser(request(), env)).toEqual({ id: "user-id", email: "" });
  });
});