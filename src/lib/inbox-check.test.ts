import { expect, it } from "vitest";
import { inboxCheck } from "./inbox-check";
it("flags deceptive subjects and shortened links without accepting lookalike hosts", () => {
  expect(inboxCheck("Re: hello", "{{company}} https://bit.ly/check").issues.filter((issue) => issue.level === "block")).toHaveLength(2);
  expect(inboxCheck("hello", "{{company}} https://notbit.ly/check").issues).toEqual([]);
});
it("allows plain personalized drafts and flags HTML", () => {
  expect(inboxCheck("question", "Hi {{first_name|there}}, {{pitch}}. Is this relevant for {{company}}?").score).toBe(100);
  expect(inboxCheck("question", "<img src='x'> {{company}}").score).toBe(65);
});