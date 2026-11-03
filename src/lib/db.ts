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

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  /** query = PostgREST query string, e.g. "status=eq.active&select=*&order=created_at.desc&limit=50" */
  async select<T = Record<string, unknown>>(table: string, query = "select=*"): Promise<T[]> {
    const res = await fetch(`${this.url}/${table}?${query}`, { headers: this.headers() });
    if (!res.ok)
      throw new Error(`db select ${table}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T[];
  }

  async one<T = Record<string, unknown>>(table: string, query: string): Promise<T | null> {
    const rows = await this.select<T>(table, `${query}&limit=1`);
    return rows[0] ?? null;
  }

  async insert<T = Record<string, unknown>>(
    table: string,
    rows: Record<string, unknown> | Record<string, unknown>[],
  ): Promise<T[]> {
    const res = await fetch(`${this.url}/${table}`, {
      method: "POST",
      headers: this.headers({ Prefer: "return=representation" }),
      body: JSON.stringify(rows),
    });
    if (!res.ok)
      throw new Error(`db insert ${table}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T[];
  }

  async upsert<T = Record<string, unknown>>(
    table: string,
    rows: Record<string, unknown> | Record<string, unknown>[],
    onConflict?: string,
  ): Promise<T[]> {
    const q = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
    const res = await fetch(`${this.url}/${table}${q}`, {
      method: "POST",
      headers: this.headers({ Prefer: "return=representation,resolution=merge-duplicates" }),
      body: JSON.stringify(rows),
    });
    if (!res.ok)
      throw new Error(`db upsert ${table}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T[];
  }

  async update<T = Record<string, unknown>>(
    table: string,
    query: string,
    patch: Record<string, unknown>,
  ): Promise<T[]> {
    const res = await fetch(`${this.url}/${table}?${query}`, {
      method: "PATCH",
      headers: this.headers({ Prefer: "return=representation" }),
      body: JSON.stringify(patch),
    });
    if (!res.ok)
      throw new Error(`db update ${table}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T[];
  }

  async rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.url}/rpc/${fn}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`db rpc ${fn}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  async delete(table: string, query: string): Promise<void> {
    const res = await fetch(`${this.url}/${table}?${query}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok)
      throw new Error(`db delete ${table}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
}

export const enc = (v: string) => encodeURIComponent(v);
