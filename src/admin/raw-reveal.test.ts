import { describe, expect, it, vi } from "vitest";
import { mergeRawReveal, needsRawEnrichment, rawScanPerson, runRawReveal } from "./raw-reveal";
import type { RawBusiness, EnrichResult, ScanJobFull } from "./store";

const row: RawBusiness = { id: "raw_1", business: "Local Shop", email: "", phone: "", website: "local.test", city: "Gent", industry: "Retail", status: "raw", scrapedAt: 1 };
const result: EnrichResult = { id: row.id, email: "owner@local.test", phone: "+32123456789", website: "local.test", source: "Website", sourceUrl: "", name: "Jane Smith", title: "Owner", linkedin: "https://linkedin.com/in/jane", score: 80, scoreReasons: ["published email"] };
describe("Raw Data reveal", () => {
  it("scans missing emails and passes business/contact details with the original row ID", () => {
    expect(needsRawEnrichment(row)).toBe(true);
    expect(rawScanPerson(row)).toMatchObject({ id: "raw_1", name: "", organizationName: "Local Shop", domain: "local.test", city: "Gent" });
  });
  it("saves found email, phone, owner and score without changing raw status", () => {
    expect(mergeRawReveal(row, result)).toMatchObject({ email: "owner@local.test", emailSource: "Website", phone: "+32123456789", contactName: "Jane Smith", contactTitle: "Owner", score: 80, status: "raw", scrapedAt: 1 });
  });
  it("preserves existing contacts and labels guesses honestly", () => {
    expect(mergeRawReveal({ ...row, email: "saved@local.test", contactName: "Saved Owner" }, { ...result, guessed: true })).toMatchObject({ email: "saved@local.test", contactName: "Saved Owner" });
    expect(mergeRawReveal(row, { ...result, guessed: true }).emailSource).toBe("Guess");
    expect(mergeRawReveal(row, { ...result, email: "", phone: "" }).email).toBe("");
  });
  it("reads back saved results, including those produced by another runner", async () => {
    const job: ScanJobFull = { id: "scan", label: "Raw", status: "done", cursor: 1, total: 1, warnings: [], last_error: null, created_at: "", updated_at: "", finished_at: "", people: [rawScanPerson(row)], results: { raw_1: result }, options: {} };
    const onRows = vi.fn();
    const step = vi.fn(async () => ({ job, produced: [] }));
    await runRawReveal([rawScanPerson(row)], { start: async () => ({ job: { ...job, status: "queued", cursor: 0 }, produced: [] }), step, status: async () => job, canContinue: async () => true, wait: async () => {}, onJob: vi.fn(), onRows, onProgress: vi.fn() });
    expect(step).toHaveBeenCalledWith("scan");
    expect(onRows).toHaveBeenCalledWith([result]);
  });
  it("never requests a new slice after Stop", async () => {
    const step = vi.fn();
    const job: ScanJobFull = { id: "scan", label: "Raw", status: "queued", cursor: 0, total: 1, warnings: [], last_error: null, created_at: "", updated_at: "", finished_at: "", people: [rawScanPerson(row)], results: {}, options: {} };
    let allowed = true;
    await runRawReveal([rawScanPerson(row)], { start: async () => ({ job, produced: [] }), step, status: async () => null, canContinue: async () => allowed, wait: async () => { allowed = false; }, onJob: vi.fn(), onRows: vi.fn(), onProgress: vi.fn() });
    expect(step).not.toHaveBeenCalled();
  });
});