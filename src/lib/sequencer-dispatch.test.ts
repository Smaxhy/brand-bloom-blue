import { beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------------------------------ *
 * A small in-memory PostgREST: enough of the query language the dispatcher *
 * uses (eq/neq/lt/lte/gt/gte/in/not.in/is.null, or=(), select, order,      *
 * limit) to run the REAL send loop against realistic rows.                  *
 * ------------------------------------------------------------------------ */
type Row = Record<string, unknown>;
const fake = vi.hoisted(() => {
  type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const failures: { table: string; match: (patch: Row) => boolean; message: string; onSelect?: (query: string) => boolean }[] = [];
const afterUpdate: ((table: string, patch: Row) => void)[] = [];

function cmp(a: unknown, b: string): number {
  const ta = typeof a === "string" ? Date.parse(a) : NaN;
  const tb = Date.parse(b);
  if (typeof a === "string" && /\d{4}-\d\d-\d\dT/.test(a) && Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
  if (typeof a === "number") return a - Number(b);
  return String(a).localeCompare(b);
}
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function test(row: Row, col: string, expr: string): boolean {
  const v = row[col];
  if (expr === "is.null") return v === null || v === undefined;
  const like = /^(not\.)?(i?like)\.(.*)$/.exec(expr);
  if (like) {
    const re = new RegExp(`^${like[3].replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[*%]/g, ".*")}$`, like[2] === "ilike" ? "i" : "");
    const hit = v !== null && v !== undefined && re.test(String(v));
    return like[1] ? v !== null && v !== undefined && !hit : hit;
  }
  if (expr.startsWith("not.in.(")) return !expr.slice(8, -1).split(",").includes(String(v));
  if (expr.startsWith("in.(")) return expr.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, "")).includes(String(v));
  const [op, ...rest] = expr.split(".");
  // PostgREST accepts "quoted" values (used for free text inside or=()).
  const val = rest.join(".").replace(/^"(.*)"$/, "$1").replace(/\\(.)/g, "$1");
  if (op === "eq") return String(v) === val;
  if (op === "neq") return v !== null && v !== undefined && String(v) !== val;
  if (v === null || v === undefined) return false;
  if (op === "lt") return cmp(v, val) < 0;
  if (op === "lte") return cmp(v, val) <= 0;
  if (op === "gt") return cmp(v, val) > 0;
  if (op === "gte") return cmp(v, val) >= 0;
  throw new Error(`unsupported filter ${col}=${expr}`);
}
function orMatch(row: Row, inner: string): boolean {
  return splitTop(inner).some((part) => {
    const i = part.indexOf(".");
    return test(row, part.slice(0, i), part.slice(i + 1));
  });
}
function query(table: string, q: string) {
  const params = q.split("&").filter(Boolean).map((kv) => {
    const i = kv.indexOf("=");
    return [kv.slice(0, i), decodeURIComponent(kv.slice(i + 1))] as const;
  });
  let rows = (tables[table] ??= []).slice();
  let order: string | null = null;
  let limit = Infinity;
  for (const [k, v] of params) {
    if (k === "select") continue;
    if (k === "order") { order = v; continue; }
    if (k === "limit") { limit = Number(v); continue; }
    if (k === "or") { rows = rows.filter((r) => orMatch(r, v.slice(1, -1))); continue; }
    rows = rows.filter((r) => test(r, k, v));
  }
  if (order) {
    const [col, dir] = order.split(".");
    rows.sort((a, b) => cmp(a[col], String(b[col])) * (dir === "desc" ? -1 : 1));
  }
  return rows.slice(0, limit);
}
let ids = 0;
class FakeDb {
  static available() { return true; }
  async select(table: string, q = "") {
    for (const f of failures) if (f.table === table && f.onSelect?.(q)) throw new Error(f.message);
    return query(table, q).map((r) => ({ ...r }));
  }
  async one(table: string, q: string) { return (await this.select(table, `${q}&limit=1`))[0] ?? null; }
  async insert(table: string, rows: Row | Row[]) {
    const list = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ id: `${table}-${++ids}`, sent_at: new Date().toISOString(), ...r }));
    for (const f of failures) if (f.table === table && list.some(f.match)) throw new Error(f.message);
    (tables[table] ??= []).push(...list);
    return list;
  }
  async insertIgnore(table: string, rows: Row | Row[]) {
    const list = Array.isArray(rows) ? rows : [rows];
    const t = (tables[table] ??= []);
    const added = list.filter((r) => !t.some((x) => x.key === r.key));
    t.push(...added.map((r) => ({ ...r })));
    return added;
  }
  async upsert(table: string, rows: Row | Row[]) { return this.insert(table, rows); }
  async update(table: string, q: string, patch: Row) {
    for (const f of failures) if (f.table === table && !f.onSelect && f.match(patch)) throw new Error(f.message);
    const hit = query(table, q);
    for (const r of hit) Object.assign(r, patch);
    for (const h of afterUpdate) h(table, patch);
    return hit.map((r) => ({ ...r }));
  }
  async rpc() { return true; }
}

  return { tables, failures, afterUpdate, FakeDb };
});
const { tables, failures, afterUpdate } = fake;

vi.mock("./db", () => ({
  Db: fake.FakeDb,
  enc: (v: string) => encodeURIComponent(v),
  pgQuote: (v: string) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
}));
const sendVia = vi.hoisted(() => vi.fn());
const threadState = vi.hoisted(() => vi.fn(async () => ({}) as Record<string, unknown>));
vi.mock("./channel", () => ({ sendVia, threadState, isGhl: (mb: { provider?: string }) => mb.provider === "ghl" }));
vi.mock("./google-oauth", () => ({ accessTokenFor: vi.fn(async () => "token") }));
const syncGhlMailbox = vi.hoisted(() => vi.fn(async (_env: unknown, _db: unknown, mb: { id: string }) => {
  const row = fake.tables.mailboxes?.find((m) => m.id === mb.id);
  if (row) row.last_sync_at = new Date().toISOString();
  return { replies: 0, bounces: 0, stops: 0 };
}));
vi.mock("./ghl-sync", () => ({ syncGhlMailbox }));
vi.mock("./reply-ai", () => ({ classifyReply: vi.fn() }));
const gmail = vi.hoisted(() => ({
  list: vi.fn(async (_token: string, _q: string) => ({ items: [] as { id: string; threadId: string }[], more: false })),
  headers: vi.fn(async (_t: string, _id: string) => null as unknown),
  full: vi.fn(async (_t: string, _id: string) => ({ text: "", messageIdHeader: "" }) as unknown),
}));
vi.mock("./gmail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./gmail")>()),
  gmailListAll: gmail.list,
  gmailGetHeaders: gmail.headers,
  gmailGetFull: gmail.full,
}));
const renderStep = vi.hoisted(() => vi.fn(({ step }: { step: { subject: string; body: string } }) => ({ subject: step.subject, text: step.body, html: step.body })));
vi.mock("./templates", () => ({ renderStep }));
vi.mock("./bounce", () => ({
  preSendCheck: vi.fn(async () => ({ ok: true, status: "valid" })),
  applyHardBounce: vi.fn(async () => {}),
  applySoftBounce: vi.fn(async () => "retry"),
  addSuppression: vi.fn(async () => {}),
  classifyBounce: vi.fn(() => "hard"),
  isInvalidRecipientError: (m: string) => /invalid email/i.test(m),
}));

import { runDispatch } from "./sequencer";
import { NotSentError } from "./send-errors";

const MB1 = "11111111-1111-4111-8111-111111111111";
const MBD = "22222222-2222-4222-8222-222222222222";
const past = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const future = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

function seed(opts: { people: number; gap?: [number, number]; extra?: Row[] } = { people: 3 }) {
  for (const k of Object.keys(tables)) delete tables[k];
  failures.length = 0;
  tables.mailboxes = [{ id: MB1, email: "sender@example.com", display_name: "Sender", status: "active", daily_cap: 100, timezone: "UTC", window_start: 0, window_end: 24, send_days: [0, 1, 2, 3, 4, 5, 6], signature: "", last_sync_at: null, provider: "ghl", created_at: past(999) }];
  tables.outreach_settings = [{ id: "singleton", company_name: "Inspirova" }];
  tables.sequences = [{ id: "seq-1", name: "Main", status: "active", mailbox_ids: [MB1], stop_on_reply: true, gap_min_sec: opts.gap?.[0] ?? 0, gap_max_sec: opts.gap?.[1] ?? 0, send_anytime: true }];
  tables.sequence_steps = [
    { id: "st-0", sequence_id: "seq-1", position: 0, delay_days: 0, subject: "Hello", body: "First" },
    { id: "st-1", sequence_id: "seq-1", position: 1, delay_days: 3, subject: "", body: "Follow-up" },
  ];
  tables.leads = [];
  tables.enrollments = [];
  for (let i = 0; i < opts.people; i++) {
    tables.leads.push({ id: `lead-${i}`, email: `person${i}@biz${i}.com`, company: `Biz ${i}`, domain: `biz${i}.com`, contact_name: "", email_verified: "valid" });
    tables.enrollments.push({ id: `en-${i}`, sequence_id: "seq-1", lead_id: `lead-${i}`, mailbox_id: i % 2 ? MB1 : null, status: "queued", current_step: 0, next_send_at: past(30 - i), thread_id: null, first_message_id: null, unsub_token: `t${i}`, variant: "A", last_error: null });
  }
  tables.enrollments.push(...((opts.extra ?? []) as Row[]));
  afterUpdate.length = 0;
  tables.messages = [];
  tables.suppressions = [];
  tables.rate_limits = [];
}

const sentTo = () => sendVia.mock.calls.map((c) => (c[3] as { to: { email: string } }).to.email);

beforeEach(() => {
  threadState.mockReset();
  threadState.mockImplementation(async () => ({}));
  gmail.list.mockReset();
  gmail.list.mockImplementation(async () => ({ items: [], more: false }));
  sendVia.mockReset();
  let n = 0;
  sendVia.mockImplementation(async () => ({ id: `m${++n}`, threadId: `th${n}`, rfcMessageId: `<r${n}>` }));
});

describe("dispatcher sends whole queues", () => {
  it("sends everyone who is due in one run when the gap allows", async () => {
    seed({ people: 5 });
    const report = await runDispatch({}, { source: "tick" });
    expect(sendVia).toHaveBeenCalledTimes(5);
    expect(report.mailboxes[0].sent).toBe(5);
    expect(tables.enrollments.every((e) => e.current_step === 1 && e.status === "active")).toBe(true);
    expect(tables.messages.filter((m) => m.status === "sent")).toHaveLength(5);
    // the send lease was given back
    expect(tables.rate_limits.find((r) => r.key === `lease:send:${MB1}`)?.window_start).toBe(new Date(0).toISOString());
  });

  it("hands a person back (still due) when the gap does not fit the time slot", async () => {
    seed({ people: 2, gap: [120, 120] });
    tables.messages.push({ id: "old", mailbox_id: MB1, direction: "out", status: "sent", sent_at: past(1) });
    const report = await runDispatch({}, { source: "tick" });
    expect(sendVia).not.toHaveBeenCalled();
    expect(report.mailboxes[0].next_send_in_sec).toBeGreaterThan(50);
    // nobody stays parked 20 minutes in the future
    expect(tables.enrollments.every((e) => Date.parse(String(e.next_send_at)) <= Date.now())).toBe(true);
  });

  it("never resends when logging the sent email fails", async () => {
    seed({ people: 1 });
    failures.push({ table: "messages", match: (r) => r.status === "sent", message: "db insert messages: 500" });
    const first = await runDispatch({}, { source: "tick" });
    expect(sendVia).toHaveBeenCalledTimes(1);
    expect(first.errors.join(" ")).toMatch(/could not log/);
    failures.length = 0;
    await runDispatch({}, { source: "tick" });
    expect(sendVia).toHaveBeenCalledTimes(1);
    expect(tables.enrollments[0].current_step).toBe(1);
  });

  it("advances without the status change when the overlap guard refuses it (no repeat email)", async () => {
    seed({ people: 1 });
    failures.push({ table: "enrollments", match: (p) => p.status === "active", message: "db update enrollments: 409 Lead already belongs to a running or paused sequence" });
    await runDispatch({}, { source: "tick" });
    failures.length = 0;
    tables.enrollments[0].next_send_at = past(1);
    await runDispatch({}, { source: "tick" });
    // second run sends the FOLLOW-UP position, never the first email again
    const positions = tables.messages.filter((m) => m.status === "sent").map((m) => m.step_position);
    expect(positions).toEqual([0, 1]);
  });

  it("holds a person whose previous send was interrupted instead of guessing", async () => {
    seed({ people: 1 });
    tables.enrollments[0].last_error = "sending step 1 at 2026-11-07T09:00:00.000Z";
    await runDispatch({}, { source: "tick" });
    expect(sendVia).not.toHaveBeenCalled();
    expect(tables.enrollments[0].status).toBe("paused");
    expect(String(tables.enrollments[0].last_error)).toMatch(/Possibly sent/);
  });

  it("heals an interrupted send that was already logged", async () => {
    seed({ people: 1 });
    tables.enrollments[0].last_error = "sending step 1 at 2026-11-07T09:00:00.000Z";
    tables.messages.push({ id: "m-x", enrollment_id: "en-0", lead_id: "lead-0", mailbox_id: MB1, direction: "out", status: "sent", step_position: 0, gmail_thread_id: "th-x", rfc_message_id: "<x>", sent_at: past(5) });
    await runDispatch({}, { source: "tick" });
    expect(sendVia).not.toHaveBeenCalled();
    expect(tables.enrollments[0].current_step).toBe(1);
    expect(tables.enrollments[0].thread_id).toBe("th-x");
  });

  it("does not email a person who is already being emailed by another sequence", async () => {
    seed({
      people: 1,
      extra: [{ id: "en-other", sequence_id: "seq-old", lead_id: "lead-0", mailbox_id: MB1, status: "active", current_step: 1, next_send_at: future(600), unsub_token: "x" }],
    });
    const report = await runDispatch({}, { source: "tick" });
    expect(sendVia).not.toHaveBeenCalled();
    expect(tables.enrollments[0].status).toBe("skipped");
    expect(report.mailboxes[0].duplicates_held).toBe(1);
  });

  it("Send now for a sequence sends first emails and due follow-ups, never future follow-ups", async () => {
    seed({
      people: 2,
      extra: [
        { id: "en-later", sequence_id: "seq-1", lead_id: "lead-9", mailbox_id: MB1, status: "active", current_step: 1, next_send_at: future(3 * 1440), unsub_token: "y" },
      ],
    });
    tables.leads.push({ id: "lead-9", email: "later@biz.com", company: "Later", domain: "biz.com", contact_name: "", email_verified: "valid" });
    tables.enrollments[0].next_send_at = future(120); // not yet due, but never emailed → included
    const report = await runDispatch({}, { source: "manual", force: { sequenceId: "seq-1" }, forceGapSec: [0, 0] });
    expect(sentTo().sort()).toEqual(["person0@biz0.com", "person1@biz1.com"]);
    expect(report.mailboxes[0].due_left).toBe(0);
  });

  it("stops one mailbox on an authentication error but keeps the person queued", async () => {
    seed({ people: 3 });
    const due = tables.enrollments[0].next_send_at;
    sendVia.mockRejectedValueOnce(new Error("GHL send 401: Invalid JWT"));
    const report = await runDispatch({}, { source: "tick" });
    expect(sendVia).toHaveBeenCalledTimes(1);
    expect(tables.enrollments.filter((e) => e.current_step === 0)).toHaveLength(3);
    expect(report.errors.join(" ")).toMatch(/401/);
    // the person did nothing wrong: still due, no note
    expect(tables.enrollments[0].next_send_at).toBe(due);
    expect(tables.enrollments[0].last_error).toBeNull();
  });

  it("backs off the whole mailbox when the provider says 'slow down'", async () => {
    seed({ people: 3 });
    const due = tables.enrollments[0].next_send_at;
    sendVia.mockRejectedValueOnce(new Error("GHL send 429: Too many requests"));
    const report = await runDispatch({}, { source: "tick" });
    expect(sendVia).toHaveBeenCalledTimes(1);
    expect(tables.enrollments[0].next_send_at).toBe(due);
    expect(report.mailboxes[0].skipped).toMatch(/slow down/);
    const pace = tables.rate_limits.filter((r) => r.key === `pace:${MB1}`).pop();
    expect(Date.parse(String(pace?.window_start))).toBeGreaterThan(Date.now() + 9 * 60_000);
  });

  it("a recipient-level failure does not stop the rest of the queue", async () => {
    seed({ people: 3 });
    sendVia.mockRejectedValueOnce(new Error("GHL send 422: something about this contact (id 4031)"));
    const report = await runDispatch({}, { source: "tick" });
    expect(sendVia).toHaveBeenCalledTimes(3);
    expect(report.mailboxes[0].sent).toBe(2);
  });

  it("respects a send lease held by another runner", async () => {
    seed({ people: 2 });
    tables.rate_limits.push({ key: `lease:send:${MB1}`, window_start: future(1), count: 7 });
    const report = await runDispatch({}, { source: "tick" });
    expect(sendVia).not.toHaveBeenCalled();
    expect(report.mailboxes[0].busy).toBe(true);
  });

  it("moves first emails off a mailbox that can no longer send", async () => {
    seed({ people: 2 });
    tables.mailboxes.push({ id: MBD, email: "dead@example.com", status: "error", daily_cap: 50, timezone: "UTC", window_start: 0, window_end: 24, send_days: [0, 1, 2, 3, 4, 5, 6], provider: "ghl", created_at: past(10) });
    tables.sequences[0].mailbox_ids = [MB1, MBD];
    tables.enrollments[0].mailbox_id = MBD;
    const report = await runDispatch({}, { source: "tick" });
    expect(report.reassigned).toBe(1);
    expect(sendVia).toHaveBeenCalledTimes(2);
  });

  it("keeps sending a follow-up from its own mailbox after that mailbox was removed from the sequence", async () => {
    seed({ people: 0 });
    tables.mailboxes.push({ id: MBD, email: "second@example.com", display_name: "", status: "active", daily_cap: 50, timezone: "UTC", window_start: 0, window_end: 24, send_days: [0, 1, 2, 3, 4, 5, 6], provider: "ghl", created_at: past(10) });
    tables.leads.push({ id: "lead-f", email: "follow@biz.com", company: "F", domain: "biz.com", contact_name: "", email_verified: "valid" });
    tables.enrollments.push({ id: "en-f", sequence_id: "seq-1", lead_id: "lead-f", mailbox_id: MBD, status: "active", current_step: 1, next_send_at: past(5), thread_id: "th-old", first_message_id: "<old>", unsub_token: "f", variant: "A", last_error: null });
    await runDispatch({}, { source: "tick" });
    expect(sendVia).toHaveBeenCalledTimes(1);
    expect((sendVia.mock.calls[0][2] as { id: string }).id).toBe(MBD);
    expect(tables.enrollments[0].current_step).toBe(2);
  });

  it("one person whose email can't be built doesn't stop the rest of the queue", async () => {
    seed({ people: 3 });
    renderStep.mockImplementationOnce(() => { throw new Error("bad {{variable}}"); });
    const report = await runDispatch({}, { source: "tick" });
    expect(sendVia).toHaveBeenCalledTimes(2);
    const broken = tables.enrollments.find((e) => e.current_step === 0)!;
    expect(String(broken.last_error)).toMatch(/Could not prepare/);
    expect(Date.parse(String(broken.next_send_at))).toBeGreaterThan(Date.now() + 50 * 60_000);
    expect(report.mailboxes[0].sent).toBe(2);
  });

  it("holds follow-ups (but not first emails) while the inbox can't be read", async () => {
    seed({
      people: 1,
      extra: [{ id: "en-fu", sequence_id: "seq-1", lead_id: "lead-fu", mailbox_id: MB1, status: "active", current_step: 1, next_send_at: past(60), thread_id: "t", first_message_id: "<f>", unsub_token: "fu", variant: "A", last_error: null }],
    });
    tables.leads.push({ id: "lead-fu", email: "fu@biz.com", company: "FU", domain: "biz.com", contact_name: "", email_verified: "valid" });
    syncGhlMailbox.mockRejectedValueOnce(new Error("GHL conversations 503: busy"));
    const report = await runDispatch({}, { source: "tick" });
    expect(sentTo()).toEqual(["person0@biz0.com"]);
    expect(report.mailboxes[0].followups_held).toBe(true);
    expect(tables.enrollments.find((e) => e.id === "en-fu")?.current_step).toBe(1);
  });

  it("does not send to someone who replied or was paused after being claimed", async () => {
    seed({ people: 1 });
    afterUpdate.push((table, patch) => {
      // right after the claim, the inbox sync marks them as replied
      if (table === "enrollments" && "mailbox_id" in patch && "next_send_at" in patch && !("status" in patch)) tables.enrollments[0].status = "replied";
    });
    await runDispatch({}, { source: "tick" });
    expect(sendVia).not.toHaveBeenCalled();
    expect(tables.enrollments[0].status).toBe("replied");
  });

  it("never sends without the 'sending' mark", async () => {
    seed({ people: 1 });
    const due = tables.enrollments[0].next_send_at;
    failures.push({ table: "enrollments", match: (p) => String(p.last_error ?? "").startsWith("sending step"), message: "db update enrollments: 503" });
    await runDispatch({}, { source: "tick" });
    expect(sendVia).not.toHaveBeenCalled();
    expect(tables.enrollments[0].next_send_at).toBe(due);
  });

  it("a failed read of the steps doesn't park the whole queue", async () => {
    seed({ people: 3 });
    let once = true;
    failures.push({ table: "sequence_steps", match: () => false, message: "db select sequence_steps: 503", onSelect: () => (once ? !(once = false) : false) });
    await runDispatch({}, { source: "tick" });
    expect(tables.enrollments.some((e) => String(e.last_error ?? "").startsWith("Could not prepare"))).toBe(false);
    expect(tables.enrollments.every((e) => Date.parse(String(e.next_send_at)) <= Date.now())).toBe(true);
    await runDispatch({}, { source: "tick" });
    expect(sendVia).toHaveBeenCalledTimes(3);
  });

  it("keeps the random gap chosen in an earlier run", async () => {
    seed({ people: 2, gap: [30, 200] });
    tables.messages.push({ id: "old", mailbox_id: MB1, direction: "out", status: "sent", sent_at: past(1) });
    tables.rate_limits.push({ key: `pace:${MB1}`, window_start: future(2.5), count: 0 });
    const report = await runDispatch({}, { source: "tick" });
    expect(sendVia).not.toHaveBeenCalled();
    expect(report.mailboxes[0].next_send_in_sec).toBeGreaterThan(120);
  });

  it("stores the next allowed send time after a send", async () => {
    seed({ people: 1, gap: [60, 60] });
    await runDispatch({}, { source: "tick" });
    const pace = tables.rate_limits.find((r) => r.key === `pace:${MB1}`);
    expect(Date.parse(String(pace?.window_start))).toBeGreaterThan(Date.now() + 50_000);
  });
  it("holds a person when the provider gives no clear answer, never resends them, and pauses the mailbox", async () => {
    seed({ people: 2 });
    sendVia.mockRejectedValueOnce(new Error("GHL send 502: Bad Gateway"));
    const report = await runDispatch({}, { source: "tick" });
    // the mailbox stops instead of trying everyone else during an outage
    expect(sendVia).toHaveBeenCalledTimes(1);
    const held = tables.enrollments.find((e) => e.id === "en-0")!;
    expect(held.status).toBe("paused");
    expect(String(held.last_error)).toMatch(/Possibly sent/);
    expect(report.errors.join(" ")).toMatch(/unclear send result/);
    expect(report.mailboxes[0].skipped).toMatch(/didn't answer clearly/);
    expect(tables.messages.find((m) => m.status === "failed")?.error).toMatch(/may have been sent/);
    // the next person keeps their place, and the mailbox waits ~10 minutes
    expect(tables.enrollments.find((e) => e.id === "en-1")?.status).toBe("queued");
    const pace = tables.rate_limits.filter((r) => r.key === `pace:${MB1}`).pop();
    expect(Date.parse(String(pace?.window_start))).toBeGreaterThan(Date.now() + 9 * 60_000);
    await runDispatch({}, { source: "tick" });
    expect(sendVia).toHaveBeenCalledTimes(1);
  });

  it("treats a lost connection during the send itself as 'possibly sent'", async () => {
    seed({ people: 1 });
    sendVia.mockRejectedValueOnce(new Error("Network connection lost."));
    await runDispatch({}, { source: "tick" });
    expect(tables.enrollments[0].status).toBe("paused");
    expect(String(tables.enrollments[0].last_error)).toMatch(/Possibly sent/);
  });

  it("a temporary problem before the send call retries that person soon and pauses the mailbox briefly", async () => {
    seed({ people: 2 });
    sendVia.mockRejectedValueOnce(new NotSentError("Network connection lost."));
    await runDispatch({}, { source: "tick" });
    expect(sendVia).toHaveBeenCalledTimes(1); // nobody else is pushed back one by one
    const en = tables.enrollments.find((e) => e.id === "en-0")!;
    expect(en.status).toBe("queued");
    expect(String(en.last_error)).toMatch(/temporary problem before sending/);
    const at = Date.parse(String(en.next_send_at));
    expect(at).toBeGreaterThan(Date.now() + 9 * 60_000);
    expect(at).toBeLessThan(Date.now() + 11 * 60_000);
    expect(tables.enrollments.find((e) => e.id === "en-1")?.last_error).toBeNull();
  });

  it("a database failure before the send puts the person back as due and stops the mailbox", async () => {
    seed({ people: 2 });
    const due = tables.enrollments[0].next_send_at;
    sendVia.mockRejectedValueOnce(new NotSentError("db select mailbox_tokens: 503"));
    const report = await runDispatch({}, { source: "tick" });
    expect(sendVia).toHaveBeenCalledTimes(1);
    expect(tables.enrollments[0].next_send_at).toBe(due);
    expect(tables.enrollments[0].last_error).toBeNull();
    expect(report.errors.join(" ")).toMatch(/mailbox_tokens/);
    await runDispatch({}, { source: "tick" });
    expect(sendVia).toHaveBeenCalledTimes(3);
  });

  it("a lost answer to the 'sending' mark doesn't later hold the person as 'possibly sent'", async () => {
    seed({ people: 1 });
    tables.enrollments[0].last_error = "emailed by another sequence in the last 24 h — waiting a day";
    let once = true;
    afterUpdate.push((table, patch) => {
      if (once && table === "enrollments" && String(patch.last_error ?? "").startsWith("sending step")) {
        once = false;
        throw new Error("db update enrollments: network connection lost");
      }
    });
    await runDispatch({}, { source: "tick" });
    expect(sendVia).not.toHaveBeenCalled();
    expect(tables.enrollments[0].last_error).toBe("emailed by another sequence in the last 24 h — waiting a day");
    await runDispatch({}, { source: "tick" });
    expect(sendVia).toHaveBeenCalledTimes(1);
    expect(tables.enrollments[0].current_step).toBe(1);
  });

  it("holds follow-ups once the inbox read gets old during a long run (first emails carry on)", async () => {
    seed({
      people: 2,
      extra: [{ id: "en-fu", sequence_id: "seq-1", lead_id: "lead-fu", mailbox_id: MB1, status: "active", current_step: 1, next_send_at: past(5), thread_id: "t", first_message_id: "<f>", unsub_token: "fu", variant: "A", last_error: null }],
    });
    tables.leads.push({ id: "lead-fu", email: "fu@biz.com", company: "FU", domain: "biz.com", contact_name: "", email_verified: "valid" });
    tables.enrollments[1].next_send_at = past(1); // second first-email comes after the follow-up
    tables.mailboxes[0].last_sync_at = past(1);
    // the inbox was just read by another run, so this run doesn't read it again
    tables.rate_limits.push({ key: `lease:sync:${MB1}`, window_start: future(4), count: 1 });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      let jumped = false;
      afterUpdate.push((table, patch) => {
        if (!jumped && table === "enrollments" && patch.current_step === 1) {
          jumped = true;
          vi.setSystemTime(Date.now() + 11 * 60_000); // the first send took "11 minutes"
        }
      });
      const report = await runDispatch({}, { source: "cron", budgetMs: 3_600_000 });
      expect(sentTo()).toEqual(["person0@biz0.com", "person1@biz1.com"]);
      expect(report.mailboxes[0].followups_held).toBe(true);
      expect(tables.enrollments.find((e) => e.id === "en-fu")?.current_step).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a Gmail inbox read that misses a message keeps follow-ups waiting", async () => {
    seed({
      people: 1,
      extra: [{ id: "en-fu", sequence_id: "seq-1", lead_id: "lead-fu", mailbox_id: MB1, status: "active", current_step: 1, next_send_at: past(60), thread_id: "t", first_message_id: "<f>", unsub_token: "fu", variant: "A", last_error: null }],
    });
    tables.leads.push({ id: "lead-fu", email: "fu@biz.com", company: "FU", domain: "biz.com", contact_name: "", email_verified: "valid" });
    tables.mailboxes[0].provider = "google";
    gmail.list.mockImplementation(async (_t: string, q: string) =>
      /mailer-daemon/.test(q) ? { items: [], more: false } : { items: [{ id: "msg-1", threadId: "t" }], more: false },
    );
    gmail.headers.mockResolvedValueOnce(null); // Gmail didn't answer for this one
    const report = await runDispatch({}, { source: "tick" });
    expect(report.mailboxes[0].synced?.partial).toBe(true);
    expect(report.mailboxes[0].followups_held).toBe(true);
    expect(tables.mailboxes[0].last_sync_at).toBeNull();
    expect(sentTo()).toEqual(["person0@biz0.com"]);
  });

  it("counts a sent email that later bounced toward today's cap", async () => {
    seed({ people: 2 });
    tables.mailboxes[0].daily_cap = 2;
    const justNow = new Date(Date.now() - 1000).toISOString();
    tables.messages.push(
      { id: "b1", mailbox_id: MB1, direction: "out", status: "bounced", sent_at: justNow },
      { id: "s1", mailbox_id: MB1, direction: "out", status: "sent", sent_at: justNow },
    );
    const report = await runDispatch({}, { source: "tick" });
    expect(sendVia).not.toHaveBeenCalled();
    expect(report.mailboxes[0].skipped).toMatch(/daily cap/);
  });
  it("a frozen 'send all' leaves out people added or falling due after it started", async () => {
    seed({
      people: 2,
      extra: [{ id: "en-late-fu", sequence_id: "seq-1", lead_id: "lead-9", mailbox_id: MB1, status: "active", current_step: 1, next_send_at: past(1), thread_id: "t", first_message_id: "<f>", unsub_token: "z", variant: "A", last_error: null, created_at: past(3000) }],
    });
    tables.leads.push({ id: "lead-9", email: "later@biz.com", company: "Later", domain: "biz.com", contact_name: "", email_verified: "valid" });
    tables.enrollments[0].created_at = past(60); // waiting when the action began
    tables.enrollments[1].created_at = past(1); // added after it began
    tables.mailboxes[0].last_sync_at = past(1);
    const report = await runDispatch({}, { source: "manual", force: { sequenceId: "seq-1", frozenAt: past(2) }, forceGapSec: [0, 0] });
    // the follow-up only fell due after the start; the second person joined later
    expect(sentTo()).toEqual(["person0@biz0.com"]);
    expect(report.mailboxes[0].due_left).toBe(0);
  });

  it("a follow-up whose conversation already has a reply is not sent, and every running sequence for them stops", async () => {
    seed({
      people: 0,
      extra: [
        { id: "en-fu", sequence_id: "seq-1", lead_id: "lead-fu", mailbox_id: MB1, status: "active", current_step: 1, next_send_at: past(5), thread_id: "conv-1", first_message_id: "<f>", unsub_token: "fu", variant: "A", last_error: null },
      ],
    });
    tables.leads.push({ id: "lead-fu", email: "fu@biz.com", company: "FU", domain: "biz.com", contact_name: "", email_verified: "valid" });
    tables.mailboxes[0].last_sync_at = past(1);
    threadState.mockResolvedValueOnce({ replied: { at: past(30), text: "Sounds good, call me", stop: false } });
    const report = await runDispatch({}, { source: "tick" });
    expect(sendVia).not.toHaveBeenCalled();
    expect(tables.enrollments[0].status).toBe("replied");
    expect(report.mailboxes[0].replies_caught).toBe(1);
  });

  it("a follow-up whose conversation shows a bounce is not sent", async () => {
    seed({
      people: 0,
      extra: [{ id: "en-fu", sequence_id: "seq-1", lead_id: "lead-fu", mailbox_id: MB1, status: "active", current_step: 1, next_send_at: past(5), thread_id: "conv-1", first_message_id: "<f>", unsub_token: "fu", variant: "A", last_error: null }],
    });
    tables.leads.push({ id: "lead-fu", email: "fu@biz.com", company: "FU", domain: "biz.com", contact_name: "", email_verified: "valid" });
    tables.mailboxes[0].last_sync_at = past(1);
    threadState.mockResolvedValueOnce({ bounced: "GHL: bounced" });
    const report = await runDispatch({}, { source: "tick" });
    expect(sendVia).not.toHaveBeenCalled();
    expect(report.mailboxes[0].bounce_blocked).toBe(1);
  });

  it("when conversations can't be checked, follow-ups keep their place and wait; first emails carry on", async () => {
    const fu = (id: string, lead: string, min: number) => ({ id, sequence_id: "seq-1", lead_id: lead, mailbox_id: MB1, status: "active", current_step: 1, next_send_at: past(min), thread_id: `conv-${id}`, first_message_id: "<f>", unsub_token: id, variant: "A", last_error: null });
    seed({ people: 1, extra: [fu("en-fu1", "lead-a", 50), fu("en-fu2", "lead-b", 45)] });
    tables.leads.push(
      { id: "lead-a", email: "a@biz.com", company: "A", domain: "biz.com", contact_name: "", email_verified: "valid" },
      { id: "lead-b", email: "b@biz2.com", company: "B", domain: "biz2.com", contact_name: "", email_verified: "valid" },
    );
    tables.mailboxes[0].last_sync_at = past(1);
    const due1 = tables.enrollments.find((e) => e.id === "en-fu1")!.next_send_at;
    threadState.mockRejectedValue(new Error("GHL messages 503: busy"));
    const report = await runDispatch({}, { source: "tick" });
    expect(sentTo()).toEqual(["person0@biz0.com"]);
    expect(threadState).toHaveBeenCalledTimes(1); // the second follow-up isn't even tried this run
    expect(tables.enrollments.find((e) => e.id === "en-fu1")!.next_send_at).toBe(due1);
    expect(report.mailboxes[0].followups_held).toBe(true);
  });

  it("a sequence that keeps going after replies sends the follow-up anyway", async () => {
    seed({
      people: 0,
      extra: [{ id: "en-fu", sequence_id: "seq-1", lead_id: "lead-fu", mailbox_id: MB1, status: "active", current_step: 1, next_send_at: past(5), thread_id: "conv-1", first_message_id: "<f>", unsub_token: "fu", variant: "A", last_error: null }],
    });
    tables.leads.push({ id: "lead-fu", email: "fu@biz.com", company: "FU", domain: "biz.com", contact_name: "", email_verified: "valid" });
    tables.sequences[0].stop_on_reply = false;
    tables.mailboxes[0].last_sync_at = past(1);
    threadState.mockResolvedValueOnce({ replied: { at: past(30), text: "thanks", stop: false } });
    await runDispatch({}, { source: "tick" });
    expect(sentTo()).toEqual(["fu@biz.com"]);
  });

  it("a deleted GoHighLevel conversation holds the follow-up for you; Send on that person sends it", async () => {
    const FU = "44444444-4444-4444-8444-444444444444";
    seed({
      people: 0,
      extra: [{ id: FU, sequence_id: "seq-1", lead_id: "lead-fu", mailbox_id: MB1, status: "active", current_step: 1, next_send_at: past(5), thread_id: "conv-1", first_message_id: "<f>", unsub_token: "fu", variant: "A", last_error: null }],
    });
    tables.leads.push({ id: "lead-fu", email: "fu@biz.com", company: "FU", domain: "biz.com", contact_name: "", email_verified: "valid" });
    tables.mailboxes[0].last_sync_at = past(1);
    threadState.mockResolvedValue({ missing: true });
    await runDispatch({}, { source: "tick" });
    expect(sendVia).not.toHaveBeenCalled();
    expect(tables.enrollments[0].status).toBe("failed");
    expect(String(tables.enrollments[0].last_error)).toMatch(/deleted/);
    await runDispatch({}, { source: "manual", force: { enrollmentIds: [FU] }, forceGapSec: [0, 0] });
    expect(sentTo()).toEqual(["fu@biz.com"]);
  });

  it("odd characters in one person's data only park that person", async () => {
    seed({ people: 2 });
    failures.push({ table: "suppressions", match: () => false, message: "db select suppressions: 400 failed to parse logic tree", onSelect: (q) => q.includes("person0") });
    await runDispatch({}, { source: "tick" });
    expect(sentTo()).toEqual(["person1@biz1.com"]);
    const parked = tables.enrollments.find((e) => e.id === "en-0")!;
    expect(String(parked.last_error)).toMatch(/Could not prepare/);
  });

  it("Send all on a paused sequence still sends first emails when many follow-ups are due", async () => {
    const fu = (id: string) => ({ id, sequence_id: "seq-1", lead_id: "lead-fu", mailbox_id: MB1, status: "active", current_step: 1, next_send_at: past(90), thread_id: "t", first_message_id: "<f>", unsub_token: id, variant: "A", last_error: null, created_at: past(9000) });
    seed({ people: 1, extra: [fu("f1"), fu("f2"), fu("f3")] });
    tables.leads.push({ id: "lead-fu", email: "fu@biz.com", company: "FU", domain: "biz.com", contact_name: "", email_verified: "valid" });
    tables.sequences[0].status = "paused";
    tables.mailboxes[0].last_sync_at = past(1);
    await runDispatch({}, { source: "manual", force: { sequenceId: "seq-1" }, forceGapSec: [0, 0], maxPerRun: 2 });
    expect(sentTo()).toEqual(["person0@biz0.com"]);
  });

  it("a person whose send was in progress is never moved to another mailbox", async () => {
    seed({ people: 2 });
    tables.enrollments[1].mailbox_id = MBD; // an ordinary stranded first email: moved
    tables.mailboxes.push({ id: MBD, email: "dead@example.com", status: "error", daily_cap: 50, timezone: "UTC", window_start: 0, window_end: 24, send_days: [0, 1, 2, 3, 4, 5, 6], provider: "ghl", created_at: past(10) });
    tables.sequences[0].mailbox_ids = [MB1, MBD];
    tables.enrollments[0].mailbox_id = MBD;
    tables.enrollments[0].last_error = "sending step 1 at 2026-11-07T09:00:00.000Z";
    const report = await runDispatch({}, { source: "tick" });
    expect(report.errors.join(" ")).not.toMatch(/reassign/);
    expect(report.reassigned).toBe(1);
    expect(tables.enrollments[0].mailbox_id).toBe(MBD);
  });

  it("can't send without knowing who else is using the mailbox", async () => {
    seed({ people: 2 });
    failures.push({ table: "rate_limits", match: () => true, message: "db insert rate_limits: 503", onSelect: () => false });
    const original = fake.FakeDb.prototype.insertIgnore;
    fake.FakeDb.prototype.insertIgnore = async () => { throw new Error("db insert rate_limits: 503"); };
    try {
      const report = await runDispatch({}, { source: "tick" });
      expect(sendVia).not.toHaveBeenCalled();
      expect(report.mailboxes[0].busy).toBe(true);
    } finally {
      fake.FakeDb.prototype.insertIgnore = original;
      failures.length = 0;
    }
  });

  it("once a person is marked as sending, no claim based on an earlier read can take them", async () => {
    seed({ people: 1 });
    let claimedAt = "";
    afterUpdate.push((table, patch) => {
      if (table === "enrollments" && "mailbox_id" in patch && "next_send_at" in patch && !claimedAt) claimedAt = String(patch.next_send_at);
    });
    let duringSend = "";
    sendVia.mockImplementationOnce(async () => {
      duringSend = String(tables.enrollments[0].next_send_at);
      return { id: "m1", threadId: "th1", rfcMessageId: "<r1>" };
    });
    await runDispatch({}, { source: "tick" });
    expect(claimedAt).not.toBe("");
    // a second runner that read the row right after the claim filters on claimedAt: no match any more
    expect(duringSend).not.toBe(claimedAt);
    expect(tables.enrollments[0].current_step).toBe(1);
  });

  it("Send all for a paused sequence sends its first emails but not its follow-ups", async () => {
    seed({
      people: 1,
      extra: [{ id: "en-fu", sequence_id: "seq-1", lead_id: "lead-fu", mailbox_id: MB1, status: "active", current_step: 1, next_send_at: past(60), thread_id: "t", first_message_id: "<f>", unsub_token: "fu", variant: "A", last_error: null, created_at: past(5000) }],
    });
    tables.leads.push({ id: "lead-fu", email: "fu@biz.com", company: "FU", domain: "biz.com", contact_name: "", email_verified: "valid" });
    tables.sequences[0].status = "paused";
    tables.mailboxes[0].last_sync_at = past(1);
    await runDispatch({}, { source: "manual", force: { sequenceId: "seq-1" }, forceGapSec: [0, 0] });
    expect(sentTo()).toEqual(["person0@biz0.com"]);
  });

  it("Send now on a follow-up reads the inbox first when the last read is old", async () => {
    const FU = "33333333-3333-4333-8333-333333333333";
    seed({
      people: 0,
      extra: [{ id: FU, sequence_id: "seq-1", lead_id: "lead-fu", mailbox_id: MB1, status: "active", current_step: 1, next_send_at: future(600), thread_id: "t", first_message_id: "<f>", unsub_token: "fu", variant: "A", last_error: null }],
    });
    tables.leads.push({ id: "lead-fu", email: "fu@biz.com", company: "FU", domain: "biz.com", contact_name: "", email_verified: "valid" });
    tables.mailboxes[0].last_sync_at = past(60);
    syncGhlMailbox.mockClear();
    await runDispatch({}, { source: "manual", force: { enrollmentIds: [FU] }, forceGapSec: [0, 0] });
    expect(syncGhlMailbox).toHaveBeenCalledTimes(1);
    expect(sentTo()).toEqual(["fu@biz.com"]);
    // …and if the inbox can't be read, the follow-up waits
    seed({
      people: 0,
      extra: [{ id: FU, sequence_id: "seq-1", lead_id: "lead-fu", mailbox_id: MB1, status: "active", current_step: 1, next_send_at: future(600), thread_id: "t", first_message_id: "<f>", unsub_token: "fu", variant: "A", last_error: null }],
    });
    tables.leads.push({ id: "lead-fu", email: "fu@biz.com", company: "FU", domain: "biz.com", contact_name: "", email_verified: "valid" });
    tables.mailboxes[0].last_sync_at = past(60);
    syncGhlMailbox.mockRejectedValueOnce(new Error("GHL conversations 503: busy"));
    sendVia.mockClear();
    const report = await runDispatch({}, { source: "manual", force: { enrollmentIds: [FU] }, forceGapSec: [0, 0] });
    expect(sendVia).not.toHaveBeenCalled();
    expect(report.mailboxes[0].followups_held).toBe(true);
  });

  it("a Gmail inbox read only opens messages from our own conversations or that look like bounces", async () => {
    seed({
      people: 0,
      extra: [{ id: "en-fu", sequence_id: "seq-1", lead_id: "lead-fu", mailbox_id: MB1, status: "completed", current_step: 2, next_send_at: past(60), thread_id: "ours", first_message_id: "<f>", unsub_token: "fu", variant: "A", last_error: null }],
    });
    tables.mailboxes[0].provider = "google";
    tables.mailboxes[0].last_sync_at = past(30);
    let queried = "";
    gmail.list.mockImplementation(async (_t: string, q: string) => {
      if (/mailer-daemon/.test(q)) return { items: [{ id: "b1", threadId: "x9" }], more: false };
      queried = q;
      return { items: [{ id: "n1", threadId: "newsletter" }, { id: "r1", threadId: "ours" }, { id: "b1", threadId: "x9" }], more: false };
    });
    gmail.headers.mockImplementation(async () => null);
    await runDispatch({}, { source: "tick" });
    const opened = gmail.headers.mock.calls.map((c) => (c as unknown[])[1]).sort();
    expect(opened).toEqual(["b1", "r1"]);
    // reads back to the last complete read (with an hour of overlap)
    const after = Number(/after:(\d+)/.exec(queried)?.[1]) * 1000;
    expect(after).toBeLessThan(Date.now() - 80 * 60_000);
    expect(after).toBeGreaterThan(Date.now() - 100 * 60_000);
    gmail.headers.mockReset();
  });
  it("a block on gmail.com (or another shared domain) never stops other people there", async () => {
    seed({ people: 1 });
    tables.leads[0].email = "joe@gmail.com";
    tables.leads[0].domain = "gmail.com";
    tables.suppressions.push({ id: "s1", email: "someone-else@gmail.com", domain: "gmail.com", reason: "bounce" });
    await runDispatch({}, { source: "tick" });
    expect(sentTo()).toEqual(["joe@gmail.com"]);
  });
  it("Gmail: a reply that started a new conversation (new subject) still stops the sequence", async () => {
    seed({
      people: 0,
      extra: [{ id: "en-fu", sequence_id: "seq-1", lead_id: "lead-fu", mailbox_id: MB1, status: "active", current_step: 1, next_send_at: future(600), thread_id: "ours", first_message_id: "<f>", unsub_token: "fu", variant: "A", last_error: null }],
    });
    tables.leads.push({ id: "lead-fu", email: "bob@biz.com", company: "Bob Co", domain: "biz.com", contact_name: "", email_verified: "valid" });
    tables.mailboxes[0].provider = "google";
    tables.mailboxes[0].last_sync_at = past(30);
    gmail.list.mockImplementation(async (_t: string, q: string) => {
      if (/from:bob@biz\.com/.test(q)) return { items: [{ id: "new1", threadId: "brand-new-thread" }], more: false };
      if (/mailer-daemon/.test(q)) return { items: [], more: false };
      return { items: [{ id: "new1", threadId: "brand-new-thread" }, { id: "spam1", threadId: "x" }], more: false };
    });
    gmail.full.mockResolvedValueOnce({ text: "Please remove me from your list.", messageIdHeader: "<r@biz.com>" });
    gmail.headers.mockImplementation(async (_t: string, id: string) =>
      id === "new1"
        ? { id, threadId: "brand-new-thread", from: "Bob <bob@biz.com>", subject: "Remove me", snippet: "remove me please", internalDate: Date.now() - 60_000, inReplyTo: "", references: "", failedRecipients: "", autoSubmitted: "", labelIds: ["INBOX"] }
        : null,
    );
    const report = await runDispatch({}, { source: "tick" });
    expect(tables.enrollments[0].status).toBe("unsubscribed");
    expect(report.mailboxes[0].synced?.stops).toBe(1);
    expect(gmail.headers.mock.calls.map((c) => (c as unknown[])[1])).toEqual(["new1"]);
    gmail.headers.mockReset();
  });

  it("Gmail: after a long gap in a busy inbox, the oldest part is read first and progress is kept", async () => {
    seed({ people: 0 });
    tables.mailboxes[0].provider = "google";
    tables.mailboxes[0].last_sync_at = past(5 * 1440);
    const queries: string[] = [];
    gmail.list.mockImplementation(async (_t: string, q: string) => {
      queries.push(q);
      if (/^in:inbox after:\d+$/.test(q)) return { items: [], more: true }; // too much at once
      return { items: [], more: false };
    });
    const report = await runDispatch({}, { source: "tick" });
    expect(queries.some((q) => /before:\d+/.test(q))).toBe(true);
    expect(report.mailboxes[0].synced?.partial).toBe(true);
    const saved = Date.parse(String(tables.mailboxes[0].last_sync_at));
    expect(saved).toBeGreaterThan(Date.now() - 5 * 1440 * 60_000);
    expect(saved).toBeLessThan(Date.now() - 60 * 60_000);
  });
});
