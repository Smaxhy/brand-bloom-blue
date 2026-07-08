/**
 * Client-side login throttle. Rate limiting the login endpoint itself
 * would require a bespoke server function in front of Supabase Auth —
 * for now we defend the UI: after N failed attempts inside a window,
 * further submissions are refused for a cool-off period.
 *
 * This is defence in depth, not a security boundary — an attacker who
 * clears storage bypasses it. Supabase's own auth server also throttles.
 */

const KEY = "inspirova.loginThrottle.v1";
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILS = 5;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes lock after MAX_FAILS

interface State {
  fails: { at: number }[];
  lockedUntil?: number;
}

function read(): State {
  if (typeof window === "undefined") return { fails: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { fails: [] };
    const s = JSON.parse(raw) as State;
    return { fails: Array.isArray(s.fails) ? s.fails : [], lockedUntil: s.lockedUntil };
  } catch {
    return { fails: [] };
  }
}

function write(s: State) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore quota errors */
  }
}

export function loginLockRemainingMs(): number {
  const s = read();
  if (s.lockedUntil && s.lockedUntil > Date.now()) return s.lockedUntil - Date.now();
  return 0;
}

export function recordLoginFailure(): number {
  const now = Date.now();
  const s = read();
  const fresh = s.fails.filter((f) => now - f.at < WINDOW_MS);
  fresh.push({ at: now });
  const next: State = { fails: fresh };
  if (fresh.length >= MAX_FAILS) next.lockedUntil = now + COOLDOWN_MS;
  write(next);
  return loginLockRemainingMs();
}

export function recordLoginSuccess(): void {
  write({ fails: [] });
}
