export type ScanAction = "start" | "step" | "status" | "cancel" | "list";

/** Each action has its own bounded budget; polling cannot block Stop or Start. */
export function scanRequestLimit(action: ScanAction, userId: string) {
  return { _key: `scan:${action}:${userId}`, _max: action === "start" ? 3 : 30, _window_seconds: 60 };
}

export type ScanRateLimit = { rateLimited: true; retryAfterMs: number };
export function isScanRateLimit(value: unknown): value is ScanRateLimit {
  return !!value && typeof value === "object" && "rateLimited" in value && value.rateLimited === true
    && "retryAfterMs" in value && typeof value.retryAfterMs === "number";
}