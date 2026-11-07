import { expect, it, vi } from "vitest";
import { checkEmailBatches } from "./email-check";
it("checks unique addresses in bounded batches without losing unchecked results", async () => {
  const emails = Array.from({ length: 51 }, (_, i) => `owner${i}@business.test`);
  const check = vi.fn(async (batch: string[]) => ({ results: Object.fromEntries(batch.slice(0, -1).map((email) => [email, "mx_ok" as const])), unchecked: batch.slice(-1) }));
  const result = await checkEmailBatches([...emails, emails[0].toUpperCase()], check);
  expect(check.mock.calls.map(([batch]) => batch.length)).toEqual([50, 1]);
  expect(result.unchecked).toEqual([emails[49], emails[50]]);
  expect(result.results[emails[0]]).toBe("mx_ok");
});