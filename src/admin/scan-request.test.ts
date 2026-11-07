import { describe, expect, it, vi } from "vitest";
import { runScanRequest } from "./scan-request";

describe("scan throttle recovery", () => {
  it("waits out the minute then returns saved work instead of aborting Reveal", async () => {
    const request = vi.fn().mockResolvedValueOnce({ rateLimited: true, retryAfterMs: 61000 }).mockResolvedValueOnce({ produced: [{ id: "saved" }] });
    const wait = vi.fn(async () => {});
    await expect(runScanRequest(request, { wait })).resolves.toEqual({ produced: [{ id: "saved" }] });
    expect(request).toHaveBeenCalledTimes(2);
    expect(wait.mock.calls.length).toBe(61);
  });
  it("never retries a slice after Stop during the throttle wait", async () => {
    let running = true;
    const request = vi.fn(async () => ({ rateLimited: true, retryAfterMs: 61000 }));
    await expect(runScanRequest(request, { canContinue: async () => running, wait: async () => { running = false; } })).rejects.toThrow("Scan stopped");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not retry unavailable protection or ambiguous network failures", async () => {
    const request = vi.fn(async () => { throw new Error("Scan protection unavailable"); });
    await expect(runScanRequest(request, { wait: vi.fn() })).rejects.toThrow("Scan protection unavailable");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("bounds repeated throttling instead of retrying forever", async () => {
    const request = vi.fn(async () => ({ rateLimited: true, retryAfterMs: 61000 }));
    await expect(runScanRequest(request, { wait: async () => {} })).rejects.toThrow("completed details remain saved");
    expect(request).toHaveBeenCalledTimes(3);
  });
});