import { describe, expect, it, vi } from "vitest";
import { MAX_RESULT_BYTES, stepScanJob } from "./scan-jobs.server";
import type { Db } from "./db";

describe("scan size recovery", () => {
  it("finishes cleanly within its storage budget and preserves earlier details", async () => {
    const job = { id: "scan", cursor: 0, total: 2, people: [{ id: "first" }, { id: "large" }], results: {} as Record<string, unknown>, warnings: [] as string[], options: {}, status: "queued" };
    const db = { one: vi.fn(async () => ({ ...job })), update: vi.fn(async (_table: string, _query: string, patch: object) => { Object.assign(job, patch); return [{ ...job }]; }) } as unknown as Db;
    const result = await stepScanJob(db, {}, "scan", "owner", async () => ({ results: [{ id: "first", email: "owner@business.test" }, { id: "large", email: "x".repeat(MAX_RESULT_BYTES) }] as never, warnings: [] }));
    expect(result.job?.status).toBe("done");
    expect(job.results.first).toMatchObject({ email: "owner@business.test" });
    expect(job.results.large).toBeUndefined();
    expect(new TextEncoder().encode(JSON.stringify(job.results)).byteLength).toBeLessThan(MAX_RESULT_BYTES);
    expect(job.warnings.join(" ")).toMatch(/size limit/);
  });
});