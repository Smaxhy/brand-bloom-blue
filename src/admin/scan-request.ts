import { isScanRateLimit } from "@/lib/scan-request-policy";

/** Retry only explicit throttling, never ambiguous mutations or network errors. */
export async function runScanRequest<T>(request: () => Promise<unknown>, options: {
  canContinue?: () => Promise<boolean>;
  wait?: (ms: number) => Promise<void>;
} = {}): Promise<T> {
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let retries = 0; ; retries++) {
    if (options.canContinue && !(await options.canContinue())) throw new Error("Scan stopped.");
    const reply = await request();
    if (!isScanRateLimit(reply)) return reply as T;
    if (retries >= 2) throw new Error("Reveal is still busy. Your scan and completed details remain saved; try again shortly.");
    // Short waits let Stop settle promptly without issuing another scan slice.
    let remaining = Math.min(61000, Math.max(1000, reply.retryAfterMs));
    while (remaining > 0) {
      if (options.canContinue && !(await options.canContinue())) throw new Error("Scan stopped.");
      const slice = Math.min(1000, remaining);
      await wait(slice);
      remaining -= slice;
    }
  }
}