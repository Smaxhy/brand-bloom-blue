export function dispatchBudgetMs(source?: "cron" | "manual"): number {
  return source === "cron" ? 50_000 : 110_000;
}

export function fitsDispatchBudget(start: number, budget: number, wait: number, now = Date.now()): boolean {
  return now - start + wait < budget;
}

export function gapElapsed(lastSentAt: string | null | undefined, gapSeconds: number, now = Date.now()): boolean {
  if (!lastSentAt) return true;
  const timestamp = Date.parse(lastSentAt);
  return Number.isFinite(timestamp) && now - timestamp >= Math.max(0, gapSeconds) * 1000;
}