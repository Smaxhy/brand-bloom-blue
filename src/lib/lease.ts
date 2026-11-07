/**
 * Short-lived named leases ("only one runner may do X right now").
 *
 * Stored in the existing service-role-only `rate_limits` table so no schema
 * change is needed: key = `lease:<name>`, window_start = when the lease
 * EXPIRES, count = the holder's random token. A runner that dies simply lets
 * its lease run out; nobody has to clean up.
 *
 * Used so that the Cloudflare cron, the database timer, an open admin tab and
 * a "Send now" click never send from the same mailbox at the same moment
 * (which used to double the sending rate and could overshoot the daily cap).
 */

import type { Db } from "./db";

type LeaseDb = Pick<Db, "update" | "insertIgnore">;

export interface Lease {
  name: string;
  token: number;
  /** Epoch ms when the lease runs out unless renewed. */
  until: number;
}

const keyOf = (name: string) => `lease:${name}`.slice(0, 200);
const newToken = () => 1 + Math.floor(Math.random() * 2_000_000_000);

/** Take the lease if it is free (or expired). Returns null when someone else holds it. */
export async function acquireLease(db: LeaseDb, name: string, ttlMs: number): Promise<Lease | null> {
  const token = newToken();
  const now = Date.now();
  const until = now + Math.max(1000, ttlMs);
  const key = keyOf(name);
  const patch = { window_start: new Date(until).toISOString(), count: token };
  const taken = await db.update<{ key: string }>(
    "rate_limits",
    `key=eq.${encodeURIComponent(key)}&window_start=lt.${encodeURIComponent(new Date(now).toISOString())}&select=key`,
    patch,
  );
  if (taken.length) return { name, token, until };
  const inserted = await db.insertIgnore<{ key: string }>("rate_limits", { key, ...patch });
  return inserted.length ? { name, token, until } : null;
}

/** Extend a lease we hold. Returns false when it was lost (expired and taken over). */
export async function renewLease(db: LeaseDb, lease: Lease, ttlMs: number): Promise<boolean> {
  const until = Date.now() + Math.max(1000, ttlMs);
  const rows = await db.update<{ key: string }>(
    "rate_limits",
    `key=eq.${encodeURIComponent(keyOf(lease.name))}&count=eq.${lease.token}&select=key`,
    { window_start: new Date(until).toISOString() },
  );
  if (!rows.length) return false;
  lease.until = until;
  return true;
}

/** Give the lease back early so the next runner doesn't have to wait for it to expire. */
export async function releaseLease(db: LeaseDb, lease: Lease | null): Promise<void> {
  if (!lease) return;
  await db
    .update(
      "rate_limits",
      `key=eq.${encodeURIComponent(keyOf(lease.name))}&count=eq.${lease.token}`,
      { window_start: new Date(0).toISOString() },
    )
    .catch(() => {});
}
