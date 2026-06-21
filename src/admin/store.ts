/**
 * Inspirova Admin — local data layer.
 *
 * Everything persists to localStorage so the panel works with zero backend.
 * When you are ready to go live with real auth + a real database, swap the
 * functions in this file for API calls (the rest of the panel reads/writes
 * exclusively through here, so nothing else has to change).
 */

export const SESSION_KEY = "inspirova.admin.session";
export const ADMIN_USER = "InspirovaManagement";
export const ADMIN_PASS = "Kakapuma08";

/* ----------------------------------------------------------------------- */
/* Types                                                                    */
/* ----------------------------------------------------------------------- */

export type StageId =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";

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
  // Optional fields populated by the Data Scraper (Apollo.io)
  contactName?: string;
  contactTitle?: string;
  seniority?: string;
  linkedin?: string;
  source?: string; // e.g. "Apollo" | "Manual import"
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
}

export interface AdminData {
  deals: Deal[];
  raw: RawBusiness[];
  clients: Client[];
  transactions: Transaction[];
  templates: EmailTemplate[];
  campaigns: EmailCampaign[];
  settings: Settings;
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
  "Paid Ads Retainer": { value: 2500, source: "Meta/Google Ads", notes: "Monthly paid media management retainer." },
  "Website Build": { value: 4500, source: "Referral", notes: "Conversion-focused website + landing pages." },
  "Lead-Gen Sprint": { value: 1800, source: "Cold Outreach", notes: "30-day lead generation campaign." },
  "Full Growth System": { value: 6000, source: "Inbound", notes: "Ads + email + automation + CRM build." },
};

/* ----------------------------------------------------------------------- */
/* Persistence                                                              */
/* ----------------------------------------------------------------------- */

const STORE_KEY = "inspirova.admin.data";

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}

function seed(): AdminData {
  const now = Date.now();
  const day = 86400000;
  return {
    deals: [
      { id: uid("d"), name: "Northwind Realty", contact: "Anna De Vos", email: "anna@northwind.be", phone: "+32 470 11 22 33", value: 2500, stage: "new", source: "Meta Ads", template: "Paid Ads Retainer", notes: "Interested in lead-gen for new development.", createdAt: now - day * 2, updatedAt: now - day * 2 },
      { id: uid("d"), name: "Lumen Studio", contact: "Tom Pauwels", email: "tom@lumen.studio", phone: "+32 478 44 55 66", value: 4500, stage: "contacted", source: "Referral", template: "Website Build", notes: "Needs new site before Q3 launch.", createdAt: now - day * 5, updatedAt: now - day * 1 },
      { id: uid("d"), name: "Bricks & Co", contact: "Sara Janssen", email: "sara@bricksco.be", phone: "+32 471 77 88 99", value: 6000, stage: "qualified", source: "Inbound", template: "Full Growth System", notes: "Budget approved, waiting on proposal.", createdAt: now - day * 8, updatedAt: now - day * 2 },
      { id: uid("d"), name: "Verde Living", contact: "Joris Maes", email: "joris@verde.be", phone: "+32 479 12 34 56", value: 1800, stage: "proposal", source: "Cold Outreach", template: "Lead-Gen Sprint", notes: "Proposal sent, follow up Friday.", createdAt: now - day * 11, updatedAt: now - day * 1 },
      { id: uid("d"), name: "Atlas Group", contact: "Eva Smeets", email: "eva@atlasgroup.be", phone: "+32 472 99 00 11", value: 5200, stage: "won", source: "Referral", template: "Full Growth System", notes: "Closed! Onboarding next week.", createdAt: now - day * 20, updatedAt: now - day * 3 },
    ],
    raw: [
      { id: uid("r"), business: "Vastgoed Vlaams", email: "info@vastgoedvlaams.be", phone: "+32 9 222 33 44", website: "vastgoedvlaams.be", city: "Gent", industry: "Real Estate", status: "raw", scrapedAt: now - day },
      { id: uid("r"), business: "Coastal Homes", email: "contact@coastalhomes.be", phone: "+32 59 11 22 33", website: "coastalhomes.be", city: "Oostende", industry: "Real Estate", status: "raw", scrapedAt: now - day },
      { id: uid("r"), business: "Urban Nest", email: "hello@urbannest.be", phone: "+32 3 444 55 66", website: "urbannest.be", city: "Antwerpen", industry: "Property Dev", status: "accepted", scrapedAt: now - day * 2 },
      { id: uid("r"), business: "Domus Plus", email: "info@domusplus.be", phone: "+32 2 555 66 77", website: "domusplus.be", city: "Brussel", industry: "Real Estate", status: "raw", scrapedAt: now - day * 3 },
    ],
    clients: [
      { id: uid("c"), company: "Atlas Group", contact: "Eva Smeets", email: "eva@atlasgroup.be", phone: "+32 472 99 00 11", address: "Kortrijksesteenweg 12, Gent", plan: "Full Growth System", monthly: 5200, status: "active", notes: "Flagship client. Monthly strategy call on Mondays.", since: now - day * 60 },
      { id: uid("c"), company: "Lumen Studio", contact: "Tom Pauwels", email: "tom@lumen.studio", phone: "+32 478 44 55 66", address: "Meir 88, Antwerpen", plan: "Website + Ads", monthly: 3100, status: "active", notes: "", since: now - day * 30 },
    ],
    transactions: [
      { id: uid("t"), label: "Atlas Group — retainer", type: "income", amount: 5200, category: "Retainer", date: isoDaysAgo(5) },
      { id: uid("t"), label: "Lumen Studio — retainer", type: "income", amount: 3100, category: "Retainer", date: isoDaysAgo(7) },
      { id: uid("t"), label: "Meta ad spend (clients)", type: "expense", amount: 1400, category: "Ad Spend", date: isoDaysAgo(6) },
      { id: uid("t"), label: "GoHighLevel subscription", type: "expense", amount: 297, category: "Software", date: isoDaysAgo(10) },
      { id: uid("t"), label: "Bricks & Co — deposit", type: "income", amount: 3000, category: "Project", date: isoDaysAgo(12) },
    ],
    templates: [
      { id: uid("tpl"), name: "Cold Intro — Real Estate", subject: "{{business}}, more qualified buyers this month?", body: "Hi {{contact}},\n\nI noticed {{business}} is active in {{city}}. We help real-estate teams get qualified buyer & seller leads on a money-back basis — you only pay for leads that fit.\n\nWorth a 15-min call this week?\n\n— The Inspirova team" },
      { id: uid("tpl"), name: "Follow-up", subject: "Quick follow-up, {{contact}}", body: "Hi {{contact}},\n\nJust circling back on my last note. Open to a short call to see if we're a fit for {{business}}?\n\n— Inspirova" },
    ],
    campaigns: [],
    settings: { ghlApiKey: "", ghlCompanyId: "", ghlLocationId: "", fromName: "Inspirova", fromEmail: "hello@inspirova.com" },
  };
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

/* ----------------------------------------------------------------------- */
/* Remote (Lovable Cloud) sync                                              */
/*                                                                          */
/* Everything in the admin panel lives in a single shared JSON blob in the  */
/* `admin_state` table (row id = "singleton"). That way any device logged   */
/* into the InspirovaManagement account sees the same pipeline, raw data,   */
/* clients, finance, templates, campaigns and settings.                     */
/*                                                                          */
/* localStorage is still used as an instant cache so the UI renders         */
/* immediately while the cloud round-trip happens in the background.        */
/* ----------------------------------------------------------------------- */

const MIGRATED_KEY = "inspirova.admin.migrated";

async function currentUserId(): Promise<string | null> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function withSchemaDefaults(d: Partial<AdminData> | null | undefined): AdminData {
  const s = seed();
  if (!d || typeof d !== "object") return s;
  return {
    ...s,
    ...d,
    settings: { ...s.settings, ...(d.settings ?? {}) },
  };
}

function readLocal(): AdminData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    return withSchemaDefaults(JSON.parse(raw) as AdminData);
  } catch {
    return null;
  }
}

function writeLocal(data: AdminData) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    /* quota etc. — ignore */
  }
}

function isEmptyRemote(d: unknown): boolean {
  if (!d || typeof d !== "object") return true;
  return Object.keys(d as Record<string, unknown>).length === 0;
}

/**
 * Synchronous fallback — returns whatever's cached locally (or the seed).
 * Used as the immediate first paint before the cloud fetch resolves.
 */
export function loadData(): AdminData {
  return readLocal() ?? seed();
}

/**
 * Fetch the shared admin state from Lovable Cloud. On first run (remote
 * empty + local has data) the local copy is pushed up so this device's
 * existing pipeline / scrapes survive the migration.
 */
export async function loadDataRemote(): Promise<AdminData> {
  const { supabase } = await import("@/integrations/supabase/client");
  const local = readLocal();
  const userId = await currentUserId();
  if (!userId) return local ?? seed();
  try {
    const { data: row, error } = await supabase
      .from("admin_state")
      .select("data")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    const remote = row?.data as Partial<AdminData> | null | undefined;
    const migratedKey = `${MIGRATED_KEY}.${userId}`;
    const alreadyMigrated =
      typeof window !== "undefined" && window.localStorage.getItem(migratedKey) === "1";

    if (!row || isEmptyRemote(remote)) {
      const base = local ?? seed();
      await pushRemote(base);
      if (typeof window !== "undefined") window.localStorage.setItem(migratedKey, "1");
      writeLocal(base);
      return base;
    }

    const merged = withSchemaDefaults(remote);

    if (!alreadyMigrated && local) {
      const mergedWithLocal = mergeLocalIntoRemote(merged, local);
      await pushRemote(mergedWithLocal);
      if (typeof window !== "undefined") window.localStorage.setItem(migratedKey, "1");
      writeLocal(mergedWithLocal);
      return mergedWithLocal;
    }

    writeLocal(merged);
    return merged;
  } catch (e) {
    console.warn("[admin] cloud load failed, using local cache", e);
    return local ?? seed();
  }
}

function mergeLocalIntoRemote(remote: AdminData, local: AdminData): AdminData {
  const mergeById = <T extends { id: string }>(r: T[], l: T[]): T[] => {
    const ids = new Set(r.map((x) => x.id));
    return [...r, ...l.filter((x) => !ids.has(x.id))];
  };
  return {
    ...remote,
    deals: mergeById(remote.deals, local.deals),
    raw: mergeById(remote.raw, local.raw),
    clients: mergeById(remote.clients, local.clients),
    transactions: mergeById(remote.transactions, local.transactions),
    templates: mergeById(remote.templates, local.templates),
    campaigns: mergeById(remote.campaigns, local.campaigns),
  };
}

async function pushRemote(data: AdminData): Promise<void> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { error } = await supabase
    .from("admin_state")
    .upsert({
      id: SINGLETON_ID,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: data as any,
      updated_at: new Date().toISOString(),
    });
  if (error) console.warn("[admin] cloud save failed", error);
}

/**
 * Write-through save. Updates the local cache immediately (so the UI feels
 * instant) and fires the cloud upsert in the background.
 */
export function saveData(data: AdminData) {
  writeLocal(data);
  void pushRemote(data);
}

/** Reset the shared blob back to the seed — affects every signed-in device. */
export async function resetData(): Promise<AdminData> {
  const s = seed();
  writeLocal(s);
  await pushRemote(s);
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
    if (cancelled) return;
    const channel = supabase
      .channel("admin_state_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_state", filter: `id=eq.${SINGLETON_ID}` },
        (payload) => {
          const next = (payload.new as { data?: Partial<AdminData> } | null)?.data;
          if (!next) return;
          const merged = withSchemaDefaults(next);
          writeLocal(merged);
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

/**
 * Sign in to Lovable Cloud and verify the user has the `admin` role.
 * Returns null on success, otherwise a short error message.
 */
export async function login(identifier: string, password: string): Promise<string | null> {
  const { supabase } = await import("@/integrations/supabase/client");
  const id = identifier.trim();
  const email = id.includes("@") ? id : `${id.toLowerCase()}@inspirova.local`;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return error?.message ?? "Sign in failed.";
  const { data: roles, error: roleErr } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  const allowed = (roles ?? []).some((r) => r.role === "admin" || r.role === "ceo" || r.role === "user");
  if (roleErr || !allowed) {
    await supabase.auth.signOut();
    return "This account isn't authorised to use the admin panel.";
  }
  return null;
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
    const res = await fetch("/api/ghl/send", {
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
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
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
    const res = await fetch("/api/apollo/search", {
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
    if (s === 422)
      return `Apollo couldn't parse the search (HTTP 422)${tail}`;
    if (s === 429)
      return `Apollo rate limit hit (HTTP 429) — wait a minute and retry${tail}`;
    return `Apollo returned HTTP ${s}${tail}`;
  }
  if (j.reason === "exception") return `the server hit an error calling Apollo${j.detail ? ` — ${j.detail}` : ""}`;
  return "";
}

/** Realistic sample data so the scraper is fully usable before going live. */
export function demoScrape(filters: ScrapeFilters): ScrapedPerson[] {
  const city = (filters.location.split(",")[0] || "Antwerp").trim();
  const industry = filters.industry.trim() || "Real Estate";
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 14) || "company";
  const companies = [
    "Northwind Group", "Lumen Studio", "Bricks & Co", "Verde Living",
    "Atlas Property", "Urban Nest", "Domus Plus", "Coastal Homes",
    "Fjord Estates", "Meridian Partners",
  ];
  const titlePool = filters.titles.trim()
    ? filters.titles.split(",").map((t) => t.trim()).filter(Boolean)
    : ["Owner", "Managing Director", "CEO", "Head of Marketing", "Commercial Director", "Founder"];
  const seniorityPool = filters.seniorities.length
    ? filters.seniorities
    : ["owner", "c_suite", "director"];
  const firsts = ["Anna", "Tom", "Sara", "Joris", "Eva", "Luc", "Femke", "Dries", "Lotte", "Bram"];
  const lasts = ["De Vos", "Pauwels", "Janssen", "Maes", "Smeets", "Peeters", "Claes", "Willems", "Goossens", "Aerts"];

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
      phone: `+32 ${4 + (i % 5)}${(70 + i).toString().slice(-2)} ${(10 + i)} ${(20 + i)} ${(30 + i)}`.slice(0, 18),
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
  source: string; // "Apollo" | "Hunter" | "Google" | "demo" | ""
  sourceUrl: string; // URL where the email was found (Hunter source / Google result link)
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
  }[],
  revealPhone = false,
): Promise<EnrichResult[]> {
  try {
    const res = await fetch("/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ people, revealPhone }),
    });
    if (res.ok) {
      const j = (await res.json()) as { results?: EnrichResult[] };
      if (Array.isArray(j.results)) {
        return j.results.map((r) => ({ ...r, website: r.website ?? "", sourceUrl: r.sourceUrl ?? "" }));
      }
    }
  } catch {
    /* ignore */
  }
  // Demo fallback: synthesise emails locally.
  return people.map((p) => {
    const dom = p.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") || "example.com";
    const f = (p.firstName || p.name.split(" ")[0] || "contact").toLowerCase();
    const l = (p.lastName || p.name.split(" ").slice(-1)[0] || "info").toLowerCase();
    return { id: p.id, email: `${f}.${l}@${dom}`, phone: "", website: dom, source: "demo", sourceUrl: "" };
  });
}

export function fmtEuro(n: number): string {
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}
