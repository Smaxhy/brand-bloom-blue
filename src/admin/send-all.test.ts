import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authFetch: vi.fn(), reads: [] as unknown[][] }));
vi.mock("./store", () => ({ authFetch: mocks.authFetch }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
 const q = { select: () => q, order: () => q, limit: () => q, eq: () => q,
 then: (resolve: (v: unknown) => void) => resolve({ data: mocks.reads.shift() ?? [], error: null }) }; return { select: () => q };
} } }));
import { sendAllNow } from "./outreach";
const person = (id: string, current_step = 0) => ({ id, status: "active", current_step, next_send_at: new Date(Date.now()+86400000).toISOString() });
const reply = (sent: number, extra = {}) => new Response(JSON.stringify({ ok: true, report: { mailboxes: [{ email: "sender@x.test", sent, remaining_today: 50, ...extra }], errors: [] } }));
beforeEach(() => { mocks.authFetch.mockReset(); mocks.reads = []; });
describe("fixed send group", () => {
 it("sends each original enrollment once and excludes newly added people", async () => {
  mocks.reads = [[person("a"), person("b")], [person("a",1), person("b"), person("new")], [person("a",1),person("b",1),person("new")]];
  mocks.authFetch.mockResolvedValueOnce(reply(1)).mockResolvedValueOnce(reply(1));
  const result = await sendAllNow("seq");
  const bodies = mocks.authFetch.mock.calls.map((c) => JSON.parse(c[1].body));
  expect(bodies.map(b => b.enrollmentIds)).toEqual([["a","b"],["b"]]);
  expect(result.sent).toBe(2); expect(result.left).toBe(0);
 });
 it("stops after a daily cap response", async () => {
  mocks.reads = [[person("a")],[person("a")]];
  mocks.authFetch.mockResolvedValueOnce(reply(0, { skipped: "daily cap reached" }));
  const result = await sendAllNow("seq");
  expect(mocks.authFetch).toHaveBeenCalledTimes(1); expect(result.note).toMatch(/Daily cap/);
 });
 it("does not include follow-ups whose delay has not elapsed", async () => {
  mocks.reads = [[person("a",1)]];
  expect((await sendAllNow("seq")).left).toBe(0); expect(mocks.authFetch).not.toHaveBeenCalled();
 });
 it("stops before requesting another send round", async () => {
  mocks.reads = [[person("a"),person("b")],[person("a",1),person("b")]];
  mocks.authFetch.mockResolvedValueOnce(reply(1)); let stop=false;
  const result=await sendAllNow("seq", { shouldStop:()=>stop, onProgress:()=>{stop=true;} });
  expect(mocks.authFetch).toHaveBeenCalledTimes(1); expect(result.sent).toBe(1);
 });
});
