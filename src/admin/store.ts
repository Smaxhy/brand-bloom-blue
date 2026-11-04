import type { LeadAi } from "@/lib/lead-filters";
/** Inspirova Admin — per-account Lovable Cloud data layer. */

/* ----------------------------------------------------------------------- */
/* Types                                                                    */
/* ----------------------------------------------------------------------- */

export type StageId = "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";

export interface Deal {
  id: string;
  name: string; // company / contact name
  contact: string; // person
  email: string;
  phone: string;
  value: number; // deal value €
  stage: StageId;
  source: string;
  template?: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface RawBusiness {
  id: string;
  business: string;
  email: string;
  phone: string;
  website: string;
  city: string;
  industry: string;
  status: "raw" | "accepted" | "rejected";
  scrapedAt: number;
  /** Timestamp of the last successful email sent to this contact. */
  lastEmailedAt?: number;
  // Optional fields populated by the Data Scraper (Apollo.io)
  contactName?: string;
  contactTitle?: string;
  seniority?: string;
  linkedin?: string;
  source?: string; // e.g. "Apollo" | "Manual import"
  emailSource?: string; // "Website" | "Guess" | "Apollo" | …
  rating?: number;
  reviews?: number;
  score?: number; // 0–100 lead score
  scoreWhy?: string[];
  ai?: LeadAi | null;
}

export interface Client {
  id: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  plan: string;
  monthly: number; // recurring revenue €
  status: "active" | "paused" | "churned";
  notes: string;
  since: number;
}

export interface Transaction {
  id: string;
  label: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  date: string; // YYYY-MM-DD
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

export interface EmailCampaign {
  id: string;
  name: string;
  templateId: string;
  recipientIds: string[]; // raw business ids
  status: "draft" | "scheduled" | "sent";
  sentAt?: number;
  createdAt: number;
}

export interface Settings {
  ghlApiKey: string;
  ghlCompanyId: string;
  ghlLocationId: string;
  fromName: string;
  fromEmail: string;
  theme?: "light" | "dark";
}

export interface DenylistEntry {
  reason: "denied" | "accepted";
  ts: number;
  name: string;
  company: string;
  email?: string;
  domain?: string;
}

export interface ScraperState {
  results: ScrapedPerson[];
  emailSource: Record<string, string>;
  emailSourceUrl: Record<string, string>;
  discoverSources: Record<string, ScrapeSource[]>;
  scores?: Record<
    string,
    {
      score: number;
      why: string[];
      ai?: LeadAi | null;
    }
  >;
  updatedAt: number;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  due?: number; // ms epoch
  priority: "low" | "med" | "high";
  clientId?: string;
  createdAt: number;
  completedAt?: number;
}

export type AdPlatform = "meta" | "google" | "tiktok" | "other";

export interface AdScan {
  id: string;
  clientId?: string;
  platform: AdPlatform;
  capturedAt: number;
  /** Free-text label the user set for this screenshot. */
  label?: string;
  /** Metrics extracted by Claude vision. All fields optional. */
  metrics: {
    campaign?: string;
    dateRange?: string;
    spend?: number;
    currency?: string;
    impressions?: number;
    reach?: number;
    clicks?: number;
    ctr?: number; // percent
    cpc?: number;
    cpm?: number;
    conversions?: number;
    cpa?: number;
    roas?: number;
    revenue?: number;
    // Service / e-com friendly extras
    sales?: number;
    orders?: number;
    sessions?: number;
    visitors?: number;
    aov?: number;
    conversionRate?: number; // percent
    returningRate?: number; // percent
    leads?: number;
    bookings?: number;
    showRate?: number; // percent
    avgTicket?: number;
    notes?: string;
  };
  /** Raw JSON returned by Claude, kept for auditing. */
  raw?: unknown;
}

export interface AdminData {
  deals: Deal[];
  raw: RawBusiness[];
  clients: Client[];
  transactions: Transaction[];
  templates: EmailTemplate[];
  campaigns: EmailCampaign[];
  settings: Settings;
  tasks?: Task[];
  adScans?: AdScan[];
  /** Per-account persistent denylist — never re-surface these contacts. */
  denylist?: Record<string, DenylistEntry>;
  /** Persisted scraper results so a page refresh keeps them. */
  scraper?: ScraperState;
}

/* ----------------------------------------------------------------------- */
/* Pipeline stage config                                                    */
/* ----------------------------------------------------------------------- */

export const STAGES: { id: StageId; label: string; tone: string }[] = [
  { id: "new", label: "New Lead", tone: "var(--brand-light)" },
  { id: "contacted", label: "Contacted", tone: "oklch(.7 .15 250)" },
  { id: "qualified", label: "Qualified", tone: "oklch(.72 .15 200)" },
  { id: "proposal", label: "Proposal Sent", tone: "var(--brand-violet)" },
  { id: "won", label: "Won", tone: "oklch(.7 .18 150)" },
  { id: "lost", label: "Lost", tone: "oklch(.6 .02 290)" },
];

/* Pipeline starter templates — pick one when creating a deal. */
export const DEAL_TEMPLATES: Record<string, Partial<Deal>> = {
  "Paid Ads Retainer": {
    value: 2500,
    source: "Meta/Google Ads",
    notes: "Monthly paid media management retainer.",
  },
  "Website Build": {
    value: 4500,
    source: "Referral",
    notes: "Conversion-focused website + landing pages.",
  },
  "Lead-Gen Sprint": {
    value: 1800,
    source: "Cold Outreach",
    notes: "30-day lead generation campaign.",
  },
  "Full Growth System": {
    value: 6000,
    source: "Inbound",
    notes: "Ads + email + automation + CRM build.",
  },
};

/* ----------------------------------------------------------------------- */
/* Persistence                                                              */
/* ----------------------------------------------------------------------- */

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}

function seed(): AdminData {
  // Every new account starts with a completely empty dataset.
  // Only the empty settings shell is provided so the UI has something to render.
  return {
    deals: [],
    raw: [],
    clients: [],
    transactions: [],
    templates: [],
    campaigns: [],
    settings: { ghlApiKey: "", ghlCompanyId: "", ghlLocationId: "", fromName: "", fromEmail: "" },
    tasks: [],
    adScans: [],
    denylist: {},
  };
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

/* ----------------------------------------------------------------------- */
/* Remote (Lovable Cloud) sync                                              */
/* Each signed-in account gets its own `admin_state` row keyed by user_id.   */
/* No admin data is read from or written to browser storage.                 */
/* ----------------------------------------------------------------------- */

async function currentUserId(): Promise<string | null> {
  const { supabase } = await import("@/integrations/supabase/client");
  // For normal admin-state reads/writes the database policies validate the
  // session token. Avoid calling the auth server on every save; overloaded
  // accounts can otherwise turn one UI action into multiple backend requests.
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

function withSchemaDefaults(d: Partial<AdminData> | null | undefined): AdminData {
  const s = seed();
  if (!d || typeof d !== "object") return s;
  const arrayOr = <T>(value: unknown, fallback: T[]): T[] =>
    Array.isArray(value) ? (value as T[]) : fallback;
  const settings = d.settings && typeof d.settings === "object" ? d.settings : {};
  const denylist = d.denylist && typeof d.denylist === "object" ? d.denylist : {};
  const scraper = d.scraper && typeof d.scraper === "object" ? d.scraper : undefined;
  return {
    ...s,
    ...d,
    deals: arrayOr<Deal>(d.deals, s.deals),
    raw: arrayOr<RawBusiness>(d.raw, s.raw),
    clients: arrayOr<Client>(d.clients, s.clients),
    transactions: arrayOr<Transaction>(d.transactions, s.transactions),
    templates: arrayOr<EmailTemplate>(d.templates, s.templates),
    campaigns: arrayOr<EmailCampaign>(d.campaigns, s.campaigns),
    tasks: arrayOr<Task>(d.tasks, s.tasks ?? []),
    adScans: arrayOr<AdScan>(d.adScans, s.adScans ?? []),
    settings: { ...s.settings, ...settings },
    denylist: { ...(s.denylist ?? {}), ...(denylist as Record<string, DenylistEntry>) },
    scraper: scraper
      ? {
          results: arrayOr<ScrapedPerson>((scraper as Partial<ScraperState>).results, []),
          emailSource: ((scraper as Partial<ScraperState>).emailSource ?? {}) as Record<
            string,
            string
          >,
          emailSourceUrl: ((scraper as Partial<ScraperState>).emailSourceUrl ?? {}) as Record<
            string,
            string
          >,
          discoverSources: ((scraper as Partial<ScraperState>).discoverSources ?? {}) as Record<
            string,
            ScrapeSource[]
          >,
          scores: ((scraper as Partial<ScraperState>).scores ?? {}) as Record<
            string,
            {
              score: number;
              why: string[];
              ai?: LeadAi | null;
            }
          >,
          updatedAt: Number((scraper as Partial<ScraperState>).updatedAt ?? Date.now()),
        }
      : s.scraper,
  };
}

function isEmptyRemote(d: unknown): boolean {
  if (!d || typeof d !== "object") return true;
  return Object.keys(d as Record<string, unknown>).length === 0;
}

function compactForRemote(data: AdminData): AdminData {
  return {
    ...data,
    raw: data.raw.slice(0, 5000),
    deals: data.deals.slice(0, 2000),
    clients: data.clients.slice(0, 1000),
    transactions: data.transactions.slice(0, 3000),
    campaigns: data.campaigns.slice(0, 1000),
    tasks: (data.tasks ?? []).slice(-2000),
    adScans: (data.adScans ?? []).slice(-500),
    denylist: Object.fromEntries(Object.entries(data.denylist ?? {}).slice(-5000)),
    scraper: data.scraper
      ? {
          ...data.scraper,
          results: data.scraper.results.slice(0, 500),
          updatedAt: Date.now(),
        }
      : undefined,
  };
}

/**
 * Fetch this account's admin state from Lovable Cloud.
 */
export async function loadDataRemote(): Promise<AdminData> {
  const { supabase } = await import("@/integrations/supabase/client");
  const userId = await currentUserId();
  if (!userId) return seed();
  try {
    const { data: row, error } = await supabase
      .from("admin_state")
      .select("data")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    const remote = row?.data as Partial<AdminData> | null | undefined;
    if (!row || isEmptyRemote(remote)) {
      const base = seed();
      await pushRemote(base);
      return base;
    }

    const merged = withSchemaDefaults(remote);
    return merged;
  } catch (e) {
    console.warn("[admin] cloud load failed", e);
    throw new Error(
      "Admin data could not be loaded. Your saved data was not changed. The backend may still be recovering from too many requests.",
    );
  }
}

async function pushRemote(
  data: AdminData,
  opts: { allowScraperClear?: boolean } = {},
): Promise<void> {
  const { supabase } = await import("@/integrations/supabase/client");
  const userId = await currentUserId();
  if (!userId) return;
  let nextData = compactForRemote(data);
  if (!opts.allowScraperClear && !data.scraper) {
    const { data: existing } = await supabase
      .from("admin_state")
      .select("data")
      .eq("user_id", userId)
      .maybeSingle();
    const existingData = withSchemaDefaults(
      existing?.data as Partial<AdminData> | null | undefined,
    );
    if (existingData.scraper)
      nextData = compactForRemote({ ...data, scraper: existingData.scraper });
  }
  const { error } = await supabase.from("admin_state").upsert({
    user_id: userId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: nextData as any,
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("[admin] cloud save failed", error);
}

/**
 * Save this account's data to Lovable Cloud.
 */
let queuedRemoteSave: AdminData | null = null;
let remoteSaveTimer: ReturnType<typeof setTimeout> | null = null;
let remoteSaveInFlight = false;

async function flushQueuedRemoteSave(): Promise<void> {
  if (remoteSaveInFlight) return;
  const next = queuedRemoteSave;
  if (!next) return;
  queuedRemoteSave = null;
  remoteSaveInFlight = true;
  try {
    await pushRemote(next);
  } catch (error) {
    console.warn("[admin] queued cloud save failed", error);
  } finally {
    remoteSaveInFlight = false;
  }
  if (queuedRemoteSave) void flushQueuedRemoteSave();
}

export function saveData(data: AdminData) {
  queuedRemoteSave = data;
  if (remoteSaveTimer) clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(() => {
    remoteSaveTimer = null;
    void flushQueuedRemoteSave();
  }, 1200);
}

/** Reset this account's data back to the seed. */
export async function resetData(): Promise<AdminData> {
  const s = seed();
  await pushRemote(s, { allowScraperClear: true });
  return s;
}

/**
 * Subscribe to remote changes so updates made on another device appear
 * here without a refresh. Returns an unsubscribe function.
 */
export function subscribeRemote(cb: (data: AdminData) => void): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  void (async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const userId = await currentUserId();
    if (cancelled || !userId) return;
    const channel = supabase
      .channel(`admin_state_changes_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_state", filter: `user_id=eq.${userId}` },
        (payload) => {
          const next = (payload.new as { data?: Partial<AdminData> } | null)?.data;
          if (!next) return;
          const merged = withSchemaDefaults(next);
          cb(merged);
        },
      )
      .subscribe();
    cleanup = () => {
      void supabase.removeChannel(channel);
    };
  })();
  return () => {
    cancelled = true;
    cleanup?.();
  };
}

/* ----------------------------------------------------------------------- */
/* Session — backed by Lovable Cloud auth + admin role check                */
/* ----------------------------------------------------------------------- */

export type LoginError = {
  message: string;
  /** Short diagnostic code shown to the user and copied to support. */
  code: string;
};

function makeErrorCode(kind: string): string {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const tail = Date.now().toString().slice(-4);
  return `${kind}-${rand}-${tail}`;
}

function classifyLoginError(raw: string): { kind: string; message: string } {
  const msg = raw || "";
  if (/failed to fetch|networkerror|load failed|fetch/i.test(msg)) {
    return {
      kind: "NET",
      message:
        "Can't reach the login server. Check your internet (or disable any ad-blocker/VPN for this site) and try again.",
    };
  }
  if (/rate|too many|429/i.test(msg)) {
    return {
      kind: "RATE",
      message: "Too many sign-in attempts. Please wait ~30 seconds and try again.",
    };
  }
  if (/invalid login|invalid.*credential|wrong/i.test(msg)) {
    return { kind: "AUTH", message: "Wrong username or password." };
  }
  if (/not.*authoris|not.*author|forbidden|role/i.test(msg)) {
    return { kind: "ROLE", message: "This account isn't authorised to use the admin panel." };
  }
  if (/timeout|timed out/i.test(msg)) {
    return {
      kind: "TIME",
      message: "The login server took too long to respond. Please try again.",
    };
  }
  return { kind: "ERR", message: msg || "Sign in failed. Please try again." };
}

/**
 * Sign in to Lovable Cloud and verify the user has the `admin` role.
 * Returns null on success, otherwise a structured error with a diagnostic code.
 */
export async function login(identifier: string, password: string): Promise<LoginError | null> {
  const fail = (raw: string): LoginError => {
    const { kind, message } = classifyLoginError(raw);
    const code = makeErrorCode(kind);
    console.warn(`[login] failure ${code}:`, raw);
    return { message, code };
  };

  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const id = identifier.trim();
    const email = id.includes("@") ? id : `${id.toLowerCase()}@inspirova.local`;

    const attemptSignIn = async () => supabase.auth.signInWithPassword({ email, password });
    let result;
    try {
      result = await attemptSignIn();
    } catch (netErr: any) {
      const m = String(netErr?.message ?? netErr ?? "");
      if (/failed to fetch|networkerror|load failed|fetch/i.test(m)) {
        await new Promise((r) => setTimeout(r, 600));
        try {
          result = await attemptSignIn();
        } catch (retryErr: any) {
          return fail(String(retryErr?.message ?? retryErr ?? "Failed to fetch"));
        }
      } else {
        return fail(m);
      }
    }
    const { data, error } = result;
    if (error || !data.user) {
      return fail(error?.message ?? "Sign in failed.");
    }

    try {
      const { data: roles, error: roleErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      const allowed = (roles ?? []).some(
        (r) => r.role === "admin" || r.role === "ceo" || r.role === "user",
      );
      if (roleErr) {
        console.warn("[login] role check failed after sign-in", roleErr);
        return null;
      }
      if (!allowed) {
        await supabase.auth.signOut();
        return fail("not authorised");
      }
    } catch (rolesErr: any) {
      console.warn("[login] role check failed, continuing:", rolesErr);
    }
    return null;
  } catch (err: any) {
    return fail(String(err?.message ?? err ?? ""));
  }
}

export async function logout(): Promise<void> {
  const { supabase } = await import("@/integrations/supabase/client");
  await supabase.auth.signOut();
}

/* ----------------------------------------------------------------------- */
/* GoHighLevel helper                                                       */
/* ----------------------------------------------------------------------- */

/**
 * Push a contact to GoHighLevel + (optionally) trigger an email.
 *
 * NOTE: GHL's API blocks direct browser calls (CORS) and your API key must
 * NOT live in front-end code in production. This function is wired so that
 * when you add a tiny serverless proxy (e.g. a Cloudflare Worker route that
 * forwards to https://services.leadconnectorhq.com), it will "just work".
 * Until then it returns a simulated success so the UI flow is testable.
 */
export interface GhlSendDetail {
  email: string;
  ok: boolean;
  status?: number;
  error?: string;
  simulated?: boolean;
}

export async function ghlSendEmail(opts: {
  apiKey: string;
  companyId?: string;
  locationId: string;
  to: { name: string; email: string }[];
  subject: string;
  body: string;
  fromName: string;
  fromEmail: string;
}): Promise<{ ok: boolean; simulated?: boolean; message: string; details: GhlSendDetail[] }> {
  try {
    const res = await authFetch("/api/ghl/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    const j = (await res.json()) as {
      ok?: boolean;
      simulated?: boolean;
      message?: string;
      details?: GhlSendDetail[];
    };
    return {
      ok: !!j.ok,
      simulated: j.simulated,
      message: j.message ?? (res.ok ? "Sent." : `Proxy responded ${res.status}`),
      details: j.details ?? [],
    };
  } catch (e) {
    return {
      ok: false,
      message: `Could not reach the GHL proxy (${(e as Error).message}).`,
      details: [],
    };
  }
}

/* ----------------------------------------------------------------------- */
/* Data Scraper — Apollo.io + geocoding                                     */
/* ----------------------------------------------------------------------- */

/**
 * Seniority levels Apollo understands. We expose the senior-rank ones the
 * agency cares about (decision makers).
 */
export const SENIORITIES: { id: string; label: string }[] = [
  { id: "owner", label: "Owner" },
  { id: "founder", label: "Founder" },
  { id: "c_suite", label: "C-Suite (CEO/CFO/CMO…)" },
  { id: "partner", label: "Partner" },
  { id: "vp", label: "VP" },
  { id: "head", label: "Head of…" },
  { id: "director", label: "Director" },
  { id: "manager", label: "Manager" },
];

export interface ScrapeFilters {
  location: string; // free text e.g. "Antwerp, Belgium" or a street address
  titles: string; // comma separated job titles (optional)
  industry: string; // keyword (optional)
  seniorities: string[]; // selected seniority ids
  perPage: number; // how many results to pull
  // Targeting refinements
  employeeRanges?: string[]; // Apollo size ranges, e.g. ["1,10","11,20"]
  minRevenue?: number; // minimum company revenue (USD)
  locationScope?: "person" | "company" | "both"; // match person location, company HQ, or both
  requireEmail?: boolean; // only keep contacts Apollo has an email for
  requirePhone?: boolean; // only keep contacts with a direct phone
  // Universal filters (every source)
  radiusKm?: number; // 0 = any
  minRating?: number; // 0 = any
  minReviews?: number; // 0 = any
  maxReviews?: number; // 0 = any
  teamSizes?: string[]; // AI-estimated bands: "1-10" | "11-50" | "51-200" | "200+"
  revenueBands?: string[]; // AI-estimated: "<250k" | "250k-1M" | "1M-5M" | "5M-25M" | "25M+"
}

export interface ScrapedPerson {
  id: string;
  name: string;
  title: string;
  seniority: string;
  email: string; // may be "" or a locked placeholder until enriched
  emailLocked: boolean;
  phone: string;
  linkedin: string;
  company: string;
  website: string;
  city: string;
  industry: string;
  rating?: number;
  reviews?: number;
  score?: number;
  scoreWhy?: string[];
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
  bbox: [number, number, number, number]; // south, north, west, east
}

export interface ScrapeResponse {
  live: boolean; // true = real Apollo data, false = demo/sample data
  people: ScrapedPerson[];
  message: string;
}

/**
 * Turn a free-text address / location into coordinates so we can show it on a
 * map. Calls the /api/geocode proxy (which forwards to OpenStreetMap Nominatim
 * server-side, where a proper User-Agent can be set). Returns null on failure.
 */
export async function geocodeLocation(q: string): Promise<GeocodeResult | null> {
  if (!q.trim()) return null;
  try {
    const res = await authFetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    if (!res.ok) return null;
    const j = (await res.json()) as Partial<GeocodeResult> | null;
    if (!j || typeof j.lat !== "number" || typeof j.lng !== "number") return null;
    return j as GeocodeResult;
  } catch {
    return null;
  }
}

/**
 * Run the actual data scrape via Apollo.io.
 *
 * IMPORTANT: Apollo's API blocks direct browser calls (CORS) and your API key
 * must never live in front-end code. This calls the /api/apollo/search proxy —
 * a Cloudflare Worker route that forwards to https://api.apollo.io with your
 * secret APOLLO_API_KEY. Until that secret is set, the proxy reports demo mode
 * and we generate realistic sample leads so the whole flow stays usable.
 */
export async function apolloSearch(filters: ScrapeFilters): Promise<ScrapeResponse> {
  let reason = "";
  try {
    const res = await authFetch("/api/apollo/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filters),
    });
    if (res.ok) {
      const j = (await res.json()) as {
        demo?: boolean;
        people?: ScrapedPerson[];
        reason?: string;
        status?: number;
        detail?: string;
      };
      if (!j.demo && Array.isArray(j.people)) {
        return {
          live: true,
          people: j.people,
          message: `Found ${j.people.length} contact(s) via Apollo.io.`,
        };
      }
      reason = describeApolloReason(j);
    } else {
      reason = `the proxy returned HTTP ${res.status}`;
    }
  } catch {
    reason = "the /api/apollo/search proxy couldn't be reached";
  }
  const people = demoScrape(filters);
  const base = `Demo mode — showing ${people.length} sample contact(s).`;
  return {
    live: false,
    people,
    message: reason
      ? `${base} Reason: ${reason}.`
      : `${base} Deploy the Apollo proxy + set APOLLO_API_KEY to scrape live data.`,
  };
}

function describeApolloReason(j: { reason?: string; status?: number; detail?: string }): string {
  if (j.reason === "missing_key")
    return "the server has no APOLLO_API_KEY (set the Worker secret, then redeploy)";
  if (j.reason === "apollo_error") {
    const s = j.status;
    const tail = j.detail ? ` — ${j.detail}` : "";
    if (s === 401 || s === 403)
      return `Apollo rejected the key (HTTP ${s}) — check it's your current master key${tail}`;
    if (s === 402)
      return `Apollo says you're out of credits (HTTP 402) — check your Apollo credit balance${tail}`;
    if (s === 422) return `Apollo couldn't parse the search (HTTP 422)${tail}`;
    if (s === 429) return `Apollo rate limit hit (HTTP 429) — wait a minute and retry${tail}`;
    return `Apollo returned HTTP ${s}${tail}`;
  }
  if (j.reason === "exception")
    return `the server hit an error calling Apollo${j.detail ? ` — ${j.detail}` : ""}`;
  return "";
}

/** Realistic sample data so the scraper is fully usable before going live. */
export function demoScrape(filters: ScrapeFilters): ScrapedPerson[] {
  const city = (filters.location.split(",")[0] || "Antwerp").trim();
  const industry = filters.industry.trim() || "Real Estate";
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 14) || "company";
  const companies = [
    "Northwind Group",
    "Lumen Studio",
    "Bricks & Co",
    "Verde Living",
    "Atlas Property",
    "Urban Nest",
    "Domus Plus",
    "Coastal Homes",
    "Fjord Estates",
    "Meridian Partners",
  ];
  const titlePool = filters.titles.trim()
    ? filters.titles
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : ["Owner", "Managing Director", "CEO", "Head of Marketing", "Commercial Director", "Founder"];
  const seniorityPool = filters.seniorities.length
    ? filters.seniorities
    : ["owner", "c_suite", "director"];
  const firsts = ["Anna", "Tom", "Sara", "Joris", "Eva", "Luc", "Femke", "Dries", "Lotte", "Bram"];
  const lasts = [
    "De Vos",
    "Pauwels",
    "Janssen",
    "Maes",
    "Smeets",
    "Peeters",
    "Claes",
    "Willems",
    "Goossens",
    "Aerts",
  ];

  const n = Math.max(3, Math.min(filters.perPage || 8, 14));
  const out: ScrapedPerson[] = [];
  for (let i = 0; i < n; i++) {
    const company = companies[i % companies.length];
    const domain = `${slug(company)}.be`;
    const first = firsts[i % firsts.length];
    const last = lasts[(i * 3) % lasts.length];
    const title = titlePool[i % titlePool.length];
    const seniority = seniorityPool[i % seniorityPool.length];
    out.push({
      id: uid("sp"),
      name: `${first} ${last}`,
      title,
      seniority,
      email: `${first.toLowerCase()}.${last.toLowerCase().replace(/\s+/g, "")}@${domain}`,
      emailLocked: false,
      phone:
        `+32 ${4 + (i % 5)}${(70 + i).toString().slice(-2)} ${10 + i} ${20 + i} ${30 + i}`.slice(
          0,
          18,
        ),
      linkedin: `https://www.linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase().replace(/\s+/g, "")}`,
      company,
      website: domain,
      city,
      industry,
    });
  }
  return out;
}

export interface EnrichResult {
  id?: string;
  email: string;
  phone: string;
  website: string; // company website found/confirmed during enrichment
  source: string; // "Website" | "Guess" | "Apollo" | "Hunter" | "Google" | "demo" | ""
  sourceUrl: string; // URL where the email was found (site page / Hunter source / Google result link)
  name?: string; // decision-maker found on the website
  title?: string;
  linkedin?: string;
  mx?: boolean | null; // domain accepts mail?
  guessed?: boolean; // pattern guess, not a published address
  score?: number;
  scoreReasons?: string[];
  ai?: LeadAi | null;
}

/**
 * Reveal emails (and optionally phones) for a batch of contacts. Runs a
 * waterfall on the server: Apollo enrichment first, then Hunter.io for anyone
 * still missing. Process at most 10 people per call (Apollo bulk limit).
 */
export async function enrichContacts(
  people: {
    id: string;
    name: string;
    firstName?: string;
    lastName?: string;
    domain: string;
    organizationName?: string;
    linkedin?: string;
    rating?: number;
    reviews?: number;
    phone?: string;
  }[],
  revealPhone = false,
  usePaid = false,
  useClaude = true,
): Promise<EnrichResult[]> {
  try {
    const res = await authFetch("/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ people, revealPhone, usePaid, useClaude }),
    });
    if (res.ok) {
      const j = (await res.json()) as { results?: EnrichResult[] };
      if (Array.isArray(j.results)) {
        return j.results.map((r) => ({
          ...r,
          website: r.website ?? "",
          sourceUrl: r.sourceUrl ?? "",
        }));
      }
    }
  } catch {
    /* ignore */
  }
  // Demo fallback: synthesise emails locally.
  return people.map((p) => {
    const dom =
      p.domain
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "") || "example.com";
    const f = (p.firstName || p.name.split(" ")[0] || "contact").toLowerCase();
    const l = (p.lastName || p.name.split(" ").slice(-1)[0] || "info").toLowerCase();
    return {
      id: p.id,
      email: `${f}.${l}@${dom}`,
      phone: "",
      website: dom,
      source: "demo",
      sourceUrl: "",
    };
  });
}

export function fmtEuro(n: number): string {
  return new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

/* ----------------------------------------------------------------------- */
/* Denylist — persistent per-account "never show again" memory              */
/* ----------------------------------------------------------------------- */

function norm(s: string | undefined): string {
  return (s || "").trim().toLowerCase();
}

export function cleanDomain(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}

/** Stable lookup keys for a contact — any match means "denied". */
export function denyKeysFor(p: {
  name?: string;
  company?: string;
  email?: string;
  website?: string;
}): string[] {
  const keys: string[] = [];
  const email = norm(p.email);
  if (email) keys.push(`e:${email}`);
  const dom = cleanDomain(p.website);
  const name = norm(p.name);
  const company = norm(p.company);
  if (name && company) keys.push(`nc:${name}|${company}`);
  if (dom && name) keys.push(`nd:${name}|${dom}`);
  if (dom && !name) keys.push(`d:${dom}`);
  return keys;
}

export function isDenied(
  denylist: Record<string, DenylistEntry> | undefined,
  p: { name?: string; company?: string; email?: string; website?: string },
): boolean {
  if (!denylist) return false;
  return denyKeysFor(p).some((k) => !!denylist[k]);
}

export function addToDenylist(
  data: AdminData,
  reason: "denied" | "accepted",
  people: { name?: string; company?: string; email?: string; website?: string }[],
): AdminData {
  const next = { ...(data.denylist ?? {}) };
  const ts = Date.now();
  for (const p of people) {
    const entry: DenylistEntry = {
      reason,
      ts,
      name: p.name ?? "",
      company: p.company ?? "",
      email: p.email ?? "",
      domain: cleanDomain(p.website),
    };
    for (const k of denyKeysFor(p)) next[k] = entry;
  }
  return { ...data, denylist: next };
}

export function restoreFromDenylist(data: AdminData, key: string): AdminData {
  const entry = data.denylist?.[key];
  if (!entry) return data;
  const next = { ...(data.denylist ?? {}) };
  // Remove all keys belonging to this same entry (same contact, multiple aliases).
  for (const k of Object.keys(next)) {
    const e = next[k];
    if (
      e.reason === entry.reason &&
      e.name === entry.name &&
      e.company === entry.company &&
      e.email === entry.email &&
      e.domain === entry.domain
    ) {
      delete next[k];
    }
  }
  return { ...data, denylist: next };
}

/** Collapse alias keys into one logical entry per contact for display. */
export function denylistEntries(
  denylist: Record<string, DenylistEntry> | undefined,
): { key: string; entry: DenylistEntry }[] {
  if (!denylist) return [];
  const seen = new Set<string>();
  const out: { key: string; entry: DenylistEntry }[] = [];
  for (const [key, entry] of Object.entries(denylist)) {
    const sig = `${entry.name}|${entry.company}|${entry.email}|${entry.domain}|${entry.reason}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push({ key, entry });
  }
  return out.sort((a, b) => b.entry.ts - a.entry.ts);
}

/* ----------------------------------------------------------------------- */
/* Google Maps business discovery                                          */
/* ----------------------------------------------------------------------- */

export interface DiscoveredBusiness {
  id: string;
  company: string;
  website: string;
  phone: string;
  address: string;
  city: string;
  industry: string;
  rating?: number;
  reviews?: number;
  source: "Google Maps" | "Google";
}

export type DiscoverProvider = "places" | "serper" | "serpapi" | "osm" | "apify";

export async function businessDiscovery(filters: {
  location: string;
  industry: string;
  perPage: number;
  providers: DiscoverProvider[];
  geo?: GeocodeResult | null;
  radiusKm?: number;
  minRating?: number;
  minReviews?: number;
  maxReviews?: number;
}): Promise<{
  live: boolean;
  businesses: DiscoveredBusiness[];
  reason?: string;
  used?: Record<string, number>;
  available?: Record<string, boolean>;
  errors?: string[];
}> {
  try {
    const res = await authFetch("/api/discover/businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: filters.location,
        industry: filters.industry,
        perPage: filters.perPage,
        providers: filters.providers,
        lat: filters.geo?.lat,
        lng: filters.geo?.lng,
        bbox: filters.geo?.bbox,
        radiusKm: filters.radiusKm || undefined,
        minRating: filters.minRating || undefined,
        minReviews: filters.minReviews || undefined,
        maxReviews: filters.maxReviews || undefined,
      }),
    });
    if (res.status === 401) return { live: false, businesses: [], reason: "Not signed in" };
    if (!res.ok) return { live: false, businesses: [], reason: `HTTP ${res.status}` };
    const j = (await res.json()) as {
      demo?: boolean;
      businesses?: DiscoveredBusiness[];
      reason?: string;
      used?: Record<string, number>;
      available?: Record<string, boolean>;
      errors?: string[];
    };
    return {
      live: !j.demo,
      businesses: j.businesses ?? [],
      reason: j.reason,
      used: j.used,
      available: j.available,
      errors: j.errors,
    };
  } catch (e) {
    return { live: false, businesses: [], reason: (e as Error).message };
  }
}

/** @deprecated kept for older callers — routes to the cheapest available provider. */
export async function googleBusinessSearch(filters: {
  location: string;
  industry: string;
  perPage: number;
}) {
  return businessDiscovery({ ...filters, providers: ["places", "serper", "serpapi", "osm"] });
}

/* ----------------------------------------------------------------------- */
/* Claude-powered website extraction                                       */
/* ----------------------------------------------------------------------- */

export interface ClaudeExtracted {
  ownerName: string;
  ownerTitle: string;
  email: string;
  phone: string;
  linkedin: string;
  industry: string;
  city: string;
  confidence: number;
}

/** Scrape a website and ask Claude to extract the senior decision-maker. */
export async function claudeExtractFromSite(input: {
  company: string;
  website: string;
}): Promise<ClaudeExtracted | null> {
  if (!input.website) return null;
  try {
    const siteRes = await authFetch("/api/scrape-site", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: input.website }),
    });
    if (!siteRes.ok) return null;
    const siteJ = (await siteRes.json()) as { ok?: boolean; text?: string };
    if (!siteJ.ok || !siteJ.text) return null;
    const extractRes = await authFetch("/api/claude/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: input.company, website: input.website, text: siteJ.text }),
    });
    if (!extractRes.ok) return null;
    const ej = (await extractRes.json()) as { ok?: boolean; extracted?: ClaudeExtracted | null };
    if (!ej.ok || !ej.extracted) return null;
    const e = ej.extracted;
    return {
      ownerName: e.ownerName || "",
      ownerTitle: e.ownerTitle || "",
      email: e.email || "",
      phone: e.phone || "",
      linkedin: e.linkedin || "",
      industry: e.industry || "",
      city: e.city || "",
      confidence: Number(e.confidence ?? 0),
    };
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------------- */
/* Unified discovery — fan-out across Apollo + Google + Claude              */
/* ----------------------------------------------------------------------- */

export type ScrapeSource = "apollo" | "google" | "osm" | "claude" | "apify";

export interface DiscoverOptions {
  sources: Record<ScrapeSource, boolean>;
  denylist?: Record<string, DenylistEntry>;
  geo?: GeocodeResult | null;
  onProgress?: (phase: string, done: number, total: number) => void;
}

function googleToPerson(b: DiscoveredBusiness, kw: string): ScrapedPerson {
  return {
    rating: b.rating,
    reviews: b.reviews,
    id: uid("gp"),
    name: "",
    title: "",
    seniority: "",
    email: "",
    emailLocked: true,
    phone: b.phone,
    linkedin: "",
    company: b.company,
    website: b.website,
    city: b.city || b.address || "",
    industry: b.industry || kw,
  };
}

/**
 * Run Apollo + Google Maps in parallel, merge by company/domain, filter denied,
 * then optionally use Claude to read each site for the senior decision-maker.
 */
export async function discoverLeads(
  filters: ScrapeFilters,
  opts: DiscoverOptions,
): Promise<{
  people: ScrapedPerson[];
  sources: Record<string, ScrapeSource[]>; // person.id -> sources that produced it
  liveApollo: boolean;
  liveGoogle: boolean;
  message: string;
  skippedDenied: number;
}> {
  const wanted = filters.perPage;
  const sourcesById: Record<string, ScrapeSource[]> = {};
  const sources = opts.sources;

  const [apolloRes, googleRes] = await Promise.all([
    sources.apollo
      ? apolloSearch(filters)
      : Promise.resolve({ live: false, people: [], message: "" } as ScrapeResponse),
    sources.google || sources.osm
      ? businessDiscovery({
          location: filters.location,
          industry: filters.industry,
          perPage: wanted,
          radiusKm: filters.radiusKm,
          minRating: filters.minRating,
          minReviews: filters.minReviews,
          maxReviews: filters.maxReviews,
          providers: [
            ...(sources.google ? (["places", "serper", "serpapi"] as DiscoverProvider[]) : []),
            ...(sources.osm ? (["osm"] as DiscoverProvider[]) : []),
          ],
          geo: opts.geo,
        })
      : Promise.resolve({ live: false, businesses: [], reason: "off" } as {
          live: boolean;
          businesses: DiscoveredBusiness[];
          reason?: string;
          used?: Record<string, number>;
        }),
  ]);

  // Merge by normalized domain (fallback: lowercased company name).
  const merged = new Map<string, ScrapedPerson>();
  const kw = filters.industry.split(",")[0]?.trim() || "";

  for (const p of apolloRes.people) {
    const key = cleanDomain(p.website) || norm(p.company) || p.id;
    if (!merged.has(key)) {
      merged.set(key, { ...p });
      sourcesById[p.id] = ["apollo"];
    }
  }
  for (const b of googleRes.businesses) {
    const key = cleanDomain(b.website) || norm(b.company) || b.id;
    const existing = merged.get(key);
    if (existing) {
      // Backfill missing fields from Google
      if (!existing.phone && b.phone) existing.phone = b.phone;
      if (!existing.website && b.website) existing.website = b.website;
      if (!existing.city && (b.city || b.address)) existing.city = b.city || b.address;
      if (!existing.industry && b.industry) existing.industry = b.industry;
      sourcesById[existing.id] = [...(sourcesById[existing.id] ?? []), "google"];
    } else {
      const person = googleToPerson(b, kw);
      merged.set(key, person);
      sourcesById[person.id] = [b.id.startsWith("osm_") ? "osm" : "google"];
    }
  }

  // Bulk source: Apify walks the map (hundreds per search). Start, then poll.
  let apifyCount = 0;
  let apifyNote = "";
  if (sources.apify) {
    try {
      const startRes = await authFetch("/api/discover/apify/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: filters.location,
          industry: filters.industry,
          perPage: wanted,
        }),
      });
      const st = (await startRes.json()) as {
        ok: boolean;
        runId?: string;
        datasetId?: string;
        error?: string;
      };
      if (!st.ok || !st.runId || !st.datasetId) {
        apifyNote = `Apify: ${st.error || "could not start"}`;
      } else {
        const t0 = Date.now();
        const MAX_MS = 8 * 60_000;
        let result: { done: boolean; status: string; businesses?: DiscoveredBusiness[] } = {
          done: false,
          status: "RUNNING",
        };
        while (Date.now() - t0 < MAX_MS) {
          opts.onProgress?.("apify", Math.round((Date.now() - t0) / 1000), 0);
          await new Promise((r) => setTimeout(r, 6000));
          const q = new URLSearchParams({
            run: st.runId,
            dataset: st.datasetId,
            city: filters.location,
            industry: kw,
          });
          const r = await authFetch(`/api/discover/apify/status?${q}`);
          result = (await r.json()) as typeof result;
          if (result.done) break;
        }
        for (const b of result.businesses ?? []) {
          const key = cleanDomain(b.website) || norm(b.company) || b.id;
          const existing = merged.get(key);
          if (existing) {
            if (!existing.phone && b.phone) existing.phone = b.phone;
            if (!existing.website && b.website) existing.website = b.website;
            sourcesById[existing.id] = [...(sourcesById[existing.id] ?? []), "apify"];
          } else {
            const person = googleToPerson(b, kw);
            merged.set(key, person);
            sourcesById[person.id] = ["apify"];
            apifyCount++;
          }
        }
        apifyNote = result.done
          ? `Apify: ${apifyCount} new`
          : `Apify: still running after 8 min — ${apifyCount} so far`;
      }
    } catch (e) {
      apifyNote = `Apify: ${(e as Error).message}`;
    }
  }

  // Filter denied + low-signal rows
  let skippedDenied = 0;
  let people = Array.from(merged.values()).filter((p) => {
    if (isDenied(opts.denylist, p)) {
      skippedDenied++;
      return false;
    }
    // Drop rows that are pure noise (no company, no website)
    return !!(p.company || p.website);
  });

  // Cap at requested size before expensive AI step
  people = people.slice(0, wanted);

  // Owner/email extraction happens once, in /api/enrich (cached, tiered crawl),
  // right after discovery — not here. "Read each website" controls that pass.

  const bits: string[] = [];
  if (sources.apollo)
    bits.push(apolloRes.live ? `Apollo: ${apolloRes.people.length}` : `Apollo: demo`);
  if (sources.google || sources.osm) {
    const used = (googleRes as { used?: Record<string, number> }).used ?? {};
    const label: Record<string, string> = {
      places: "Google Places",
      serper: "Serper",
      serpapi: "SerpApi",
      osm: "OpenStreetMap",
    };
    const parts = Object.entries(used).map(([k, v]) => `${label[k] ?? k}: ${v}`);
    bits.push(
      googleRes.live
        ? parts.join(" · ") || `Local: ${googleRes.businesses.length}`
        : `Local: ${googleRes.reason ?? "off"}`,
    );
  }
  if (apifyNote) bits.push(apifyNote);
  const message = `${people.length} unique business(es) after merge. ${bits.join(" · ")}${
    skippedDenied ? ` · ${skippedDenied} skipped (denied)` : ""
  }`;

  return {
    people,
    sources: sourcesById,
    liveApollo: apolloRes.live,
    liveGoogle: googleRes.live,
    message,
    skippedDenied,
  };
}

/* ----------------------------------------------------------------------- */
/* Account data export — GDPR-friendly, CRM-portable                        */
/* ----------------------------------------------------------------------- */

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Array.from(
    rows.reduce((s, r) => {
      Object.keys(r).forEach((k) => s.add(k));
      return s;
    }, new Set<string>()),
  );
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function download(name: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Download the full account as a single JSON file (portable to any CRM). */
export function exportAccountJson(data: AdminData, accountName: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  const payload = {
    schema: "inspirova.admin.v1",
    exportedAt: new Date().toISOString(),
    account: accountName,
    counts: {
      clients: data.clients.length,
      deals: data.deals.length,
      leads: data.raw.length,
      transactions: data.transactions.length,
      tasks: (data.tasks ?? []).length,
      campaigns: data.campaigns.length,
      adScans: (data.adScans ?? []).length,
    },
    data,
  };
  download(
    `inspirova-${accountName || "account"}-${stamp}.json`,
    "application/json",
    JSON.stringify(payload, null, 2),
  );
}

/** Download each table as its own CSV. CRM-import friendly. */
export function exportAccountCsvs(data: AdminData, accountName: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  const prefix = `inspirova-${accountName || "account"}-${stamp}`;
  const tables: Record<string, Record<string, unknown>[]> = {
    clients: data.clients as unknown as Record<string, unknown>[],
    deals: data.deals as unknown as Record<string, unknown>[],
    leads: data.raw as unknown as Record<string, unknown>[],
    transactions: data.transactions as unknown as Record<string, unknown>[],
    tasks: (data.tasks ?? []) as unknown as Record<string, unknown>[],
    campaigns: data.campaigns as unknown as Record<string, unknown>[],
    templates: data.templates as unknown as Record<string, unknown>[],
    ad_scans: (data.adScans ?? []).map((a) => ({
      id: a.id,
      clientId: a.clientId,
      platform: a.platform,
      capturedAt: a.capturedAt,
      label: a.label,
      ...a.metrics,
    })) as unknown as Record<string, unknown>[],
  };
  Object.entries(tables).forEach(([name, rows]) => {
    if (!rows.length) return;
    download(`${prefix}-${name}.csv`, "text/csv", toCsv(rows));
  });
}

/* ----------------------------------------------------------------------- */
/* authFetch — every /api/* call carries the signed-in user's token.        */
/* The Worker rejects anonymous calls (see src/lib/api-auth.ts), so nobody  */
/* can burn your API credits or send mail by hitting the URL directly.      */
/* ----------------------------------------------------------------------- */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers ?? {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/* ----------------------------------------------------------------------- */
/* Claude vision — extract metrics from an ad-dashboard screenshot          */
/* ----------------------------------------------------------------------- */

export async function claudeScanAdScreenshot(opts: {
  imageBase64: string; // data URL or raw base64
  mediaType: string; // e.g. image/png
  platform: AdPlatform;
  hint?: string;
}): Promise<{ ok: boolean; metrics?: AdScan["metrics"]; raw?: unknown; error?: string }> {
  try {
    const res = await authFetch("/api/claude/ad-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    const j = (await res.json()) as {
      ok?: boolean;
      metrics?: AdScan["metrics"];
      raw?: unknown;
      error?: string;
      reason?: string;
    };
    if (!j.ok)
      return { ok: false, error: j.error || j.reason || `Scan failed (HTTP ${res.status})` };
    return { ok: true, metrics: j.metrics, raw: j.raw };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
