/**
 * Minimal PostgREST client for the Worker, using the service-role key.
 * Used by cron jobs and OAuth callbacks that run with no user session.
 * Keep it boring: select / insert / update / upsert / delete / rpc.
 */

type Env = Record<string, string | undefined>;

export class Db {
  private url: string;
  private key: string;

  constructor(env: Env) {
    const url =
      env.SUPABASE_URL ||
      env.VITE_SUPABASE_URL ||
      process.env?.SUPABASE_URL ||
      process.env?.VITE_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env?.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
      throw new Error(
        "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for server database access.",
      );
    this.url = url.replace(/\/$/, "") + "/rest/v1";
    this.key = key;
  }

  static available(env: Env): boolean {
    return !!(
      (env.SUPABASE_URL ||
        env.VITE_SUPABASE_URL ||
        process.env?.SUPABASE_URL ||
        process.env?.VITE_SUPABASE_URL) &&
      (env.SUPABASE_SERVICE_ROLE_KEY || process.env?.SUPABASE_SERVICE_ROLE_KEY)
    );
  }

  /** Every failure — HTTP error, lost connection, bad JSON — reads "db <op> <table>: …". */
  private async call<T>(op: string, table: string, url: string, init: RequestInit, parse = true): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(10000) });
    } catch (err) {
      throw new Error(`db ${op} ${table}: ${(err as Error).message || "request failed"}`);
    }
    if (!res.ok) throw new Error(`db ${op} ${table}: ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`);
    if (!parse) return undefined as T;
    try {
      return (await res.json()) as T;
    } catch (err) {
      throw new Error(`db ${op} ${table}: unreadable answer (${(err as Error).message})`);
    }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: this.key,
      ...(this.key.startsWith("sb_") ? {} : { Authorization: `Bearer ${this.key}` }),
      "Content-Type": "application/json",
      ...extra,
    };
  }

  /** query = PostgREST query string, e.g. "status=eq.active&select=*&order=created_at.desc&limit=50" */
  async select<T = Record<string, unknown>>(table: string, query = "select=*"): Promise<T[]> {
    return this.call<T[]>("select", table, `${this.url}/${table}?${query}`, { headers: this.headers() });
  }

  async one<T = Record<string, unknown>>(table: string, query: string): Promise<T | null> {
    const rows = await this.select<T>(table, `${query}&limit=1`);
    return rows[0] ?? null;
  }

  async insert<T = Record<string, unknown>>(
    table: string,
    rows: Record<string, unknown> | Record<string, unknown>[],
  ): Promise<T[]> {
    return this.call<T[]>("insert", table, `${this.url}/${table}`, {
      method: "POST",
      headers: this.headers({ Prefer: "return=representation" }),
      body: JSON.stringify(rows),
    });
  }

  /** Insert, silently skipping rows whose primary/unique key already exists. */
  async insertIgnore<T = Record<string, unknown>>(
    table: string,
    rows: Record<string, unknown> | Record<string, unknown>[],
  ): Promise<T[]> {
    return this.call<T[]>("insert", table, `${this.url}/${table}`, {
      method: "POST",
      headers: this.headers({ Prefer: "return=representation,resolution=ignore-duplicates" }),
      body: JSON.stringify(rows),
    });
  }

  async upsert<T = Record<string, unknown>>(
    table: string,
    rows: Record<string, unknown> | Record<string, unknown>[],
    onConflict?: string,
  ): Promise<T[]> {
    const q = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
    return this.call<T[]>("upsert", table, `${this.url}/${table}${q}`, {
      method: "POST",
      headers: this.headers({ Prefer: "return=representation,resolution=merge-duplicates" }),
      body: JSON.stringify(rows),
    });
  }

  async update<T = Record<string, unknown>>(
    table: string,
    query: string,
    patch: Record<string, unknown>,
  ): Promise<T[]> {
    return this.call<T[]>("update", table, `${this.url}/${table}?${query}`, {
      method: "PATCH",
      headers: this.headers({ Prefer: "return=representation" }),
      body: JSON.stringify(patch),
    });
  }

  async rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
    return this.call<T>("rpc", fn, `${this.url}/rpc/${fn}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(args),
    });
  }

  async delete(table: string, query: string): Promise<void> {
    await this.call<void>("delete", table, `${this.url}/${table}?${query}`, {
      method: "DELETE",
      headers: this.headers(),
    }, false);
  }
}

/** A value inside a PostgREST or=()/in.() list, quoted so commas or brackets in it can't break the query. */
export function pgQuote(v: string): string {
  return `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export const enc = (v: string) => encodeURIComponent(v);
