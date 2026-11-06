import { describe, expect, it, vi } from "vitest";
import { createRevealScanControl } from "./reveal-scan-control";

describe("reveal scan stop", () => {
  it("blocks further slices after Stop succeeds, including during cancellation", async () => {
    const control = createRevealScanControl();
    let finish: () => void = () => {};
    const cancel = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const stopping = control.stop(cancel);
    const duplicate = control.stop(cancel);
    const nextSlice = vi.fn();
    const continuing = control.canContinue().then((allowed) => { if (allowed) nextSlice(); });
    await Promise.resolve();
    expect(nextSlice).not.toHaveBeenCalled();
    finish();
    await Promise.all([stopping, duplicate, continuing]);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(nextSlice).not.toHaveBeenCalled();
    expect(await control.canContinue()).toBe(false);
  });

  it("allows retry when cancellation fails rather than falsely marking it stopped", async () => {
    const control = createRevealScanControl();
    await expect(control.stop(async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    expect(await control.canContinue()).toBe(true);
    await control.stop(async () => {});
    expect(await control.canContinue()).toBe(false);
  });
});