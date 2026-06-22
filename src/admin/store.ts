/** Inspirova Admin — per-account Lovable Cloud data layer. */

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
  updatedAt: number;
}

export interface AdminData {
  deals: Deal[];
  raw: RawBusiness[];
  clients: Client[];
  transactions: Transaction[];
  templates: EmailTemplate[];
  campaigns: EmailCampaign[];
  settings: Settings;
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
  "Paid Ads Retainer": { value: 2500, source: "Meta/Google Ads", notes: "Monthly paid media management retainer." },
  "Website Build": { value: 4500, source: "Referral", notes: "Conversion-focused website + landing pages." },
  "Lead-Gen Sprint": { value: 1800, source: "Cold Outreach", notes: "30-day lead generation campaign." },
  "Full Growth System": { value: 6000, source: "Inbound", notes: "Ads + email + automation + CRM build." },
};

/* ----------------------------------------------------------------------- */
/* Persistence                                                              */
/* ----------------------------------------------------------------------- */

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
    denylist: { ...(s.denylist ?? {}), ...((d.denylist ?? {}) as Record<string, DenylistEntry>) },
    scraper: (d.scraper as ScraperState | undefined) ?? s.scraper,
  };
}


function isEmptyRemote(d: unknown): boolean {
  if (!d || typeof d !== "object") return true;
  return Object.keys(d as Record<string, unknown>).length === 0;
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
    return seed();
  }
}

async function pushRemote(data: AdminData, opts: { allowScraperClear?: boolean } = {}): Promise<void> {
  const { supabase } = await import("@/integrations/supabase/client");
  const userId = await currentUserId();
  if (!userId) return;
  let nextData = data;
  if (!opts.allowScraperClear && !data.scraper) {
    const { data: existing } = await supabase
      .from("admin_state")
      .select("data")
      .eq("user_id", userId)
      .maybeSingle();
    const existingData = withSchemaDefaults(existing?.data as Partial<AdminData> | null | undefined);
    if (existingData.scraper) nextData = { ...data, scraper: existingData.scraper };
  }
  const { error } = await supabase
    .from("admin_state")
    .upsert({
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
export function saveData(data: AdminData) {
  void pushRemote(data);
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

/**
 * Sign in to Lovable Cloud and verify the user has the `admin` role.
 * Returns null on success, otherwise a short error message.
 */
export async function login(identifier: string, password: string): Promise<string | null> {
  const { supabase } = await import("@/integrations/supabase/client");
  const id = identifier.trim();
  const email = id.includes("@") ? id : `${id.toLowerCase()}@inspirova.local`;
  await supabase.auth.signOut();
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

/* ----------------------------------------------------------------------- */
/* Denylist — persistent per-account "never show again" memory              */
/* ----------------------------------------------------------------------- */

function norm(s: string | undefined): string {
  return (s || "").trim().toLowerCase();
}

export function cleanDomain(s: string | undefined): string {
  if (!s) return "";
  return s.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").trim().toLowerCase();
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

export async function googleBusinessSearch(filters: {
  location: string;
  industry: string;
  perPage: number;
}): Promise<{ live: boolean; businesses: DiscoveredBusiness[]; reason?: string }> {
  try {
    const res = await fetch("/api/google/businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filters),
    });
    if (!res.ok) return { live: false, businesses: [], reason: `HTTP ${res.status}` };
    const j = (await res.json()) as {
      demo?: boolean;
      businesses?: DiscoveredBusiness[];
      reason?: string;
    };
    return {
      live: !j.demo,
      businesses: j.businesses ?? [],
      reason: j.reason,
    };
  } catch (e) {
    return { live: false, businesses: [], reason: (e as Error).message };
  }
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
    const siteRes = await fetch("/api/scrape-site", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: input.website }),
    });
    if (!siteRes.ok) return null;
    const siteJ = (await siteRes.json()) as { ok?: boolean; text?: string };
    if (!siteJ.ok || !siteJ.text) return null;
    const extractRes = await fetch("/api/claude/extract", {
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

export type ScrapeSource = "apollo" | "google" | "claude";

export interface DiscoverOptions {
  sources: Record<ScrapeSource, boolean>;
  denylist?: Record<string, DenylistEntry>;
  onProgress?: (phase: string, done: number, total: number) => void;
}

function googleToPerson(b: DiscoveredBusiness, kw: string): ScrapedPerson {
  return {
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
    sources.google
      ? googleBusinessSearch({
          location: filters.location,
          industry: filters.industry,
          perPage: wanted,
        })
      : Promise.resolve({ live: false, businesses: [], reason: "off" } as {
          live: boolean;
          businesses: DiscoveredBusiness[];
          reason?: string;
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
      sourcesById[person.id] = ["google"];
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

  // Claude pass — only run for rows that have a website but no person yet,
  // or whose website looks like a legit business site.
  if (sources.claude && people.length) {
    const targets = people.filter((p) => p.website && (!p.name || !p.email));
    opts.onProgress?.("ai", 0, targets.length);
    let done = 0;
    const CONCURRENCY = 4;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (p) => {
          const ex = await claudeExtractFromSite({ company: p.company, website: p.website });
          done++;
          opts.onProgress?.("ai", done, targets.length);
          if (!ex) return;
          if (ex.ownerName && !p.name) p.name = ex.ownerName;
          if (ex.ownerTitle && !p.title) p.title = ex.ownerTitle;
          if (ex.email) {
            p.email = ex.email;
            p.emailLocked = false;
          }
          if (ex.phone && !p.phone) p.phone = ex.phone;
          if (ex.linkedin && !p.linkedin) p.linkedin = ex.linkedin;
          if (ex.industry && !p.industry) p.industry = ex.industry;
          if (ex.city && !p.city) p.city = ex.city;
          sourcesById[p.id] = [...(sourcesById[p.id] ?? []), "claude"];
        }),
      );
    }
    // Drop low-confidence ghosts (no person, no email, no phone) after AI pass
    people = people.filter((p) => p.company && (p.name || p.email || p.phone));
  }

  const bits: string[] = [];
  if (sources.apollo) bits.push(apolloRes.live ? `Apollo: ${apolloRes.people.length}` : `Apollo: demo`);
  if (sources.google)
    bits.push(googleRes.live ? `Google Maps: ${googleRes.businesses.length}` : `Google: ${googleRes.reason ?? "off"}`);
  if (sources.claude) bits.push("Claude: enriched");
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
