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
describe("faster background reading", () => {
  function jobDb(job: Record<string, unknown>) {
    const writes: Record<string, unknown>[] = [];
    const db = {
      update: vi.fn(async (_t: string, query: string, patch: Record<string, unknown>) => {
        writes.push(patch);
        if (query.includes("or=(lease_until")) { Object.assign(job, patch); return [{ ...job }]; }
        Object.assign(job, patch);
        return [{ id: job.id }];
      }),
      one: vi.fn(async () => ({ ...job })),
    } as unknown as Db;
    return { db, writes };
  }
  it("reads several websites per chunk and renews its lease after each save", async () => {
    const people = Array.from({ length: 13 }, (_, i) => ({ id: `p${i}` }));
    const job: Record<string, unknown> = { id: "scan", cursor: 0, total: 13, people, results: {}, warnings: [], options: {} };
    const { db, writes } = jobDb(job);
    const sizes: number[] = [];
    const worker = vi.fn(async (chunk: { id?: string }[]) => {
      sizes.push(chunk.length);
      return { results: chunk.map((p) => ({ id: p.id }) as never), warnings: [] };
    });
    const r = await stepScanJob(db, {}, "scan", "owner", worker, { budgetMs: 60_000 });
    expect(sizes).toEqual([6, 6, 1]);
    expect(r.produced).toHaveLength(13);
    expect(writes.filter((w) => "lease_until" in w && w.lease_until).length).toBeGreaterThanOrEqual(4);
    expect(job.status).toBe("done");
  });
  it("stops after the site limit and leaves the rest for the next runner", async () => {
    const people = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}` }));
    const job: Record<string, unknown> = { id: "scan", cursor: 0, total: 20, people, results: {}, warnings: [], options: {} };
    const { db } = jobDb(job);
    const worker = vi.fn(async (chunk: { id?: string }[]) => ({ results: chunk.map((p) => ({ id: p.id }) as never), warnings: [] }));
    await stepScanJob(db, {}, "scan", "owner", worker, { budgetMs: 60_000, maxSites: 8 });
    expect(job.cursor).toBe(8);
    expect(job.status).toBe("running");
    expect(job.lease_token).toBeNull();
  });
  it("skips one website that keeps crashing the reader and says so", async () => {
    const people = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}` }));
    const job: Record<string, unknown> & { warnings: string[] } = { id: "scan", cursor: 0, total: 3, people, results: {}, warnings: [], options: { _stalls: 3 } };
    const { db } = jobDb(job);
    const worker = vi.fn(async (chunk: { id?: string }[]) => ({ results: chunk.map((p) => ({ id: p.id }) as never), warnings: [] }));
    await stepScanJob(db, {}, "scan", "owner", worker, { budgetMs: 60_000, skip: 1 });
    expect(worker.mock.calls[0]?.[0]?.[0]).toMatchObject({ id: "p1" });
    expect(job.warnings.join(" ")).toMatch(/Skipped 1 website/);
  });
});
