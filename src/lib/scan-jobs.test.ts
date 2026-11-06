import { describe, expect, it, vi } from "vitest";
import { stepScanJob, listScanJobs, cancelScanJob } from "./scan-jobs.server";
import type { Db } from "./db";
describe("persisted scan protections", () => {
  it("scopes listing and cancellation to the authenticated owner", async () => {
    const select = vi.fn(async (_table: string, _query: string) => []);
    const update = vi.fn(async (_table: string, _query: string, _patch: Record<string, unknown>) => []);
    const db = { select, update } as unknown as Db;
    await listScanJobs(db, "owner-a"); await cancelScanJob(db, "scan", "owner-a");
    expect(select.mock.calls[0]?.[1]).toContain("created_by=eq.owner-a");
    expect(update.mock.calls[0]?.[1]).toContain("created_by=eq.owner-a");
    expect(update.mock.calls[0]?.[2]).toMatchObject({ status: "cancelled", lease_token: null });
  });
  it("does not restart a cancelled job when work finishes after cancellation", async () => {
    const writes: { query: string; patch: Record<string, unknown> }[] = [];
    let status = "running";
    const update = vi.fn(async (_table: string, query: string, patch: Record<string, unknown>) => {
      writes.push({ query, patch });
      if (writes.length === 1) return [{ id: "scan", cursor: 0, total: 1, people: [{ id: "person" }], results: {}, warnings: [], options: {} }];
      return status === "cancelled" ? [] : [{ id: "scan" }];
    });
    const db = { update, one: vi.fn(async () => ({ status })) } as unknown as Db;
    const result = await stepScanJob(db, {}, "scan", "owner", async () => { status = "cancelled"; return { results: [], warnings: [] }; });
    expect(result.job?.status).toBe("cancelled");
    expect(writes).toHaveLength(2);
    expect(writes[1]?.query).toContain("status=eq.running&lease_token=eq.");
    expect(writes.some(({ patch }, index) => index > 0 && patch.status === "running")).toBe(false);
  });
  it("does no external work when another runner owns the claim", async () => {
    const worker = vi.fn();
    const db = { update: vi.fn(async () => []), one: vi.fn(async () => null) } as unknown as Db;
    expect((await stepScanJob(db, {}, "scan", "owner", worker)).claimed).toBe(false);
    expect(worker).not.toHaveBeenCalled();
  });
});