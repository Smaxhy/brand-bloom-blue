import { describe, expect, it, vi } from "vitest";

const addSuppression = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("./bounce", () => ({ addSuppression }));

import { applyReply, enrollmentForThread } from "./reply-actions";

type Row = Record<string, unknown>;
function db(enrollments: Row[], sequences: Row[]) {
  const updates: { q: string; patch: Row }[] = [];
  const pick = (q: string) => {
    const lead = /lead_id=eq\.([^&]+)/.exec(q)?.[1];
    const status = /status=in\.\(([^)]+)\)/.exec(q)?.[1]?.split(",");
    return enrollments.filter((e) => (!lead || e.lead_id === lead) && (!status || status.includes(String(e.status))));
  };
  return {
    updates,
    async select(table: string, q: string) {
      if (table === "sequences") {
        const ids = /id=in\.\(([^)]+)\)/.exec(q)?.[1]?.split(",") ?? [];
        return sequences.filter((s) => ids.includes(String(s.id)));
      }
      if (/thread_id=eq\./.test(q)) {
        const t = /thread_id=eq\.([^&]+)/.exec(q)?.[1];
        return enrollments.filter((e) => e.thread_id === t);
      }
      return pick(q);
    },
    async update(_t: string, q: string, patch: Row) {
      updates.push({ q, patch });
      const ids = /id=in\.\(([^)]+)\)/.exec(q)?.[1]?.split(",") ?? [];
      const not = /status=not\.in\.\(([^)]+)\)/.exec(q)?.[1]?.split(",") ?? [];
      const neq = /status=neq\.([^&]+)/.exec(q)?.[1];
      for (const e of enrollments)
        if (ids.includes(String(e.id)) && !not.includes(String(e.status)) && e.status !== neq) Object.assign(e, patch);
      return [];
    },
  };
}

describe("a reply stops every running sequence for that person", () => {
  it("stops the running one too, not only the thread's old one", async () => {
    const rows = [
      { id: "old", lead_id: "L", sequence_id: "s1", status: "completed", thread_id: "conv" },
      { id: "new", lead_id: "L", sequence_id: "s2", status: "active", thread_id: "conv" },
      { id: "other", lead_id: "X", sequence_id: "s2", status: "active", thread_id: "c2" },
    ];
    const d = db(rows, [{ id: "s1", stop_on_reply: true }, { id: "s2", stop_on_reply: true }]);
    await applyReply(d as never, { enrollment: rows[0] as never, lead: { email: "a@b.com" }, stop: false, at: "2026-11-07T10:00:00Z", note: "hi" });
    expect(rows.find((r) => r.id === "new")?.status).toBe("replied");
    expect(rows.find((r) => r.id === "old")?.status).toBe("replied");
    expect(rows.find((r) => r.id === "other")?.status).toBe("active");
    expect(addSuppression).not.toHaveBeenCalled();
  });
  it("keeps a sequence going when 'stop on reply' is off, but a 'stop' always wins", async () => {
    const rows = [{ id: "a", lead_id: "L", sequence_id: "keep", status: "active" }];
    const d = db(rows, [{ id: "keep", stop_on_reply: false }]);
    await applyReply(d as never, { enrollment: rows[0] as never, lead: { email: "a@b.com" }, stop: false, at: "t", note: "" });
    expect(rows[0].status).toBe("active");
    await applyReply(d as never, { enrollment: rows[0] as never, lead: { email: "a@b.com", domain: "b.com" }, stop: true, at: "t", note: "remove me" });
    expect(rows[0].status).toBe("unsubscribed");
    expect(addSuppression).toHaveBeenCalledWith(d, expect.objectContaining({ email: "a@b.com", reason: "replied_stop" }));
  });
  it("never turns a bounce into 'replied'", async () => {
    const rows = [{ id: "a", lead_id: "L", sequence_id: "s", status: "bounced" }];
    const d = db(rows, [{ id: "s", stop_on_reply: true }]);
    await applyReply(d as never, { enrollment: rows[0] as never, lead: null, stop: false, at: "t", note: "" });
    expect(rows[0].status).toBe("bounced");
  });
  it("picks the running enrolment of a shared conversation", async () => {
    const rows = [
      { id: "old", status: "completed", thread_id: "conv" },
      { id: "new", status: "active", thread_id: "conv" },
    ];
    const d = db(rows, []);
    expect((await enrollmentForThread<{ id: string; status: string }>(d as never, "thread_id=eq.conv"))?.id).toBe("new");
  });
});
