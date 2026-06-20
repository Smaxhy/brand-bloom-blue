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
  name: string;
  contact: string;
  email: string;
  phone: string;
  value: number; // total deal value €
  stage: StageId;
  source: string;
  services: string[]; // selected service ids (see SERVICES)
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
  contactName?: string;
  contactTitle?: string;
  seniority?: string;
  linkedin?: string;
  source?: string;
}

export interface Client {
  id: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  plan: string;
  services: string[]; // selected service ids
  monthly: number; // recurring revenue €
  setupFee: number; // one-time setup fee €
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
  { id: "qualified", label: "Qualified", tone: "oklch(.6 .12 290)" },
  { id: "proposal", label: "Proposal Sent", tone: "var(--brand-violet)" },
  { id: "won", label: "Won", tone: "var(--brand-violet)" },
  { id: "lost", label: "Lost", tone: "oklch(.6 .02 290)" },
];

/* ----------------------------------------------------------------------- */
/* Services catalog — what the agency actually sells                        */
/* ----------------------------------------------------------------------- */

export type ServiceBilling = "monthly" | "one-time";

export interface Service {
  id: string;
  name: string;
  price: number; // €
  billing: ServiceBilling;
  desc: string;
}

export const SERVICES: Service[] = [
  { id: "ads_management",   name: "Ads Management",        price: 500,  billing: "monthly",  desc: "Ongoing Meta / Google / TikTok ads management." },
  { id: "ads_setup",        name: "Ads Setup",             price: 500,  billing: "one-time", desc: "Account, pixel, audiences and first creative set up." },
  { id: "website_build",    name: "Website Build",         price: 2500, billing: "one-time", desc: "Conversion-focused website or Shopify store build." },
  { id: "email_sms",        name: "Email & SMS Marketing", price: 500,  billing: "monthly",  desc: "Flows, broadcasts and SMS campaigns." },
  { id: "service_fee",      name: "Service Fee",           price: 500,  billing: "monthly",  desc: "Standard monthly service / strategy fee." },
];

export function getService(id: string): Service | undefined {
  return SERVICES.find((s) => s.id === id);
}

export function totalsForServices(ids: string[]): { monthly: number; setup: number; total: number } {
  let monthly = 0;
  let setup = 0;
  for (const id of ids) {
    const s = getService(id);
    if (!s) continue;
    if (s.billing === "monthly") monthly += s.price;
    else setup += s.price;
  }
  return { monthly, setup, total: monthly + setup };
}

/* Pipeline starter templates — bundles of services. */
export const DEAL_TEMPLATES: Record<string, { services: string[]; source: string; notes: string }> = {
  "Ads Management Retainer": { services: ["ads_setup", "ads_management"], source: "Meta/Google Ads", notes: "Setup + monthly ads management." },
  "Website Build":           { services: ["website_build"],               source: "Referral",        notes: "Conversion-focused website / Shopify store." },
  "Email & SMS Marketing":   { services: ["email_sms"],                   source: "Inbound",         notes: "Monthly email + SMS marketing." },
  "Full Growth System":      { services: ["website_build", "ads_setup", "ads_management", "email_sms"], source: "Inbound", notes: "Website + ads + email/SMS — full system." },
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
      { id: uid("d"), name: "Northwind Realty", contact: "Anna De Vos", email: "anna@northwind.be", phone: "+32 470 11 22 33", value: 1000, stage: "new",       source: "Meta Ads",      services: ["ads_setup", "ads_management"], template: "Ads Management Retainer", notes: "Wants ongoing Meta ads.",                createdAt: now - day * 2,  updatedAt: now - day * 2 },
      { id: uid("d"), name: "Lumen Studio",     contact: "Tom Pauwels", email: "tom@lumen.studio",   phone: "+32 478 44 55 66", value: 2500, stage: "contacted", source: "Referral",      services: ["website_build"],               template: "Website Build",           notes: "New site before Q3 launch.",              createdAt: now - day * 5,  updatedAt: now - day * 1 },
      { id: uid("d"), name: "Bricks & Co",      contact: "Sara Janssen", email: "sara@bricksco.be",  phone: "+32 471 77 88 99", value: 4000, stage: "qualified", source: "Inbound",       services: ["website_build", "ads_setup", "ads_management"], template: "Full Growth System", notes: "Budget approved, waiting on proposal.",   createdAt: now - day * 8,  updatedAt: now - day * 2 },
      { id: uid("d"), name: "Verde Living",     contact: "Joris Maes",   email: "joris@verde.be",    phone: "+32 479 12 34 56", value: 500,  stage: "proposal",  source: "Cold Outreach", services: ["email_sms"],                   template: "Email & SMS Marketing",   notes: "Proposal sent, follow up Friday.",        createdAt: now - day * 11, updatedAt: now - day * 1 },
      { id: uid("d"), name: "Atlas Group",      contact: "Eva Smeets",   email: "eva@atlasgroup.be", phone: "+32 472 99 00 11", value: 4000, stage: "won",       source: "Referral",      services: ["website_build", "ads_setup", "ads_management", "email_sms"], template: "Full Growth System", notes: "Closed! Onboarding next week.",           createdAt: now - day * 20, updatedAt: now - day * 3 },
    ],
    raw: [
      { id: uid("r"), business: "Coastal Apparel",  email: "shop@coastalapparel.be", phone: "+32 59 11 22 33", website: "coastalapparel.be", city: "Oostende",  industry: "E-commerce",  status: "raw",      scrapedAt: now - day },
      { id: uid("r"), business: "Urban Nest",       email: "hello@urbannest.be",     phone: "+32 3 444 55 66", website: "urbannest.be",      city: "Antwerpen", industry: "Furniture / DTC", status: "accepted", scrapedAt: now - day * 2 },
      { id: uid("r"), business: "Domus Plus",       email: "info@domusplus.be",      phone: "+32 2 555 66 77", website: "domusplus.be",      city: "Brussel",   industry: "Home Goods",  status: "raw",      scrapedAt: now - day * 3 },
      { id: uid("r"), business: "Vastgoed Vlaams",  email: "info@vastgoedvlaams.be", phone: "+32 9 222 33 44", website: "vastgoedvlaams.be", city: "Gent",      industry: "Real Estate", status: "raw",      scrapedAt: now - day },
    ],
    clients: [
      { id: uid("c"), company: "Atlas Group",  contact: "Eva Smeets",   email: "eva@atlasgroup.be", phone: "+32 472 99 00 11", address: "Kortrijksesteenweg 12, Gent", plan: "Full Growth System", services: ["website_build", "ads_setup", "ads_management", "email_sms"], monthly: 1000, setupFee: 3000, status: "active", notes: "Flagship client. Monthly strategy call on Mondays.", since: now - day * 60 },
      { id: uid("c"), company: "Lumen Studio", contact: "Tom Pauwels",  email: "tom@lumen.studio",  phone: "+32 478 44 55 66", address: "Meir 88, Antwerpen",          plan: "Website + Ads",      services: ["website_build", "ads_setup", "ads_management"],               monthly: 500,  setupFee: 3000, status: "active", notes: "",                                                  since: now - day * 30 },
    ],
    transactions: [
      { id: uid("t"), label: "Atlas Group — retainer",       type: "income",  amount: 1000, category: "Retainer", date: isoDaysAgo(5) },
      { id: uid("t"), label: "Lumen Studio — retainer",      type: "income",  amount: 500,  category: "Retainer", date: isoDaysAgo(7) },
      { id: uid("t"), label: "Meta ad spend (clients)",      type: "expense", amount: 1400, category: "Ad Spend", date: isoDaysAgo(6) },
      { id: uid("t"), label: "GoHighLevel subscription",     type: "expense", amount: 297,  category: "Software", date: isoDaysAgo(10) },
      { id: uid("t"), label: "Bricks & Co — setup deposit",  type: "income",  amount: 2500, category: "Project",  date: isoDaysAgo(12) },
    ],
    templates: [
      { id: uid("tpl"), name: "Cold Intro — E-commerce", subject: "{{business}} — more revenue from your store this month?", body: "Hi {{contact}},\n\nI noticed {{business}} is doing great work in {{city}}. We help e-commerce brands scale with paid ads, email & SMS marketing and conversion-focused websites.\n\nWorth a 15-min call this week?\n\n— The Inspirova team" },
      { id: uid("tpl"), name: "Follow-up",               subject: "Quick follow-up, {{contact}}",                              body: "Hi {{contact}},\n\nJust circling back on my last note. Open to a short call to see if we're a fit for {{business}}?\n\n— Inspirova" },
    ],
    campaigns: [],
    settings: { ghlApiKey: "", ghlLocationId: "", fromName: "Inspirova", fromEmail: "hello@inspirova.com" },
  };
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

export function loadData(): AdminData {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) {
      const s = seed();
      window.localStorage.setItem(STORE_KEY, JSON.stringify(s));
      return s;
    }
    const parsed = JSON.parse(raw) as AdminData;
    // make sure newer keys exist if the schema grew
    return { ...seed(), ...parsed, settings: { ...seed().settings, ...parsed.settings } };
  } catch {
    return seed();
  }
}

export function saveData(data: AdminData) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

export function resetData(): AdminData {
  const s = seed();
  saveData(s);
  return s;
}

/* ----------------------------------------------------------------------- */
/* Session                                                                  */
/* ----------------------------------------------------------------------- */

export function isAuthed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SESSION_KEY) === "1";
}

export function login(user: string, pass: string): boolean {
  if (user.trim() === ADMIN_USER && pass === ADMIN_PASS) {
    window.localStorage.setItem(SESSION_KEY, "1");
    return true;
  }
  return false;
}

export function logout() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
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
export async function ghlSendEmail(opts: {
  apiKey: string;
  locationId: string;
  to: { name: string; email: string }[];
  subject: string;
  body: string;
  fromName: string;
  fromEmail: string;
}): Promise<{ ok: boolean; simulated?: boolean; message: string }> {
  if (!opts.apiKey || !opts.locationId) {
    return { ok: true, simulated: true, message: `Simulated send to ${opts.to.length} contact(s). Add your GoHighLevel API key + Location ID in Settings to send for real.` };
  }
  try {
    const res = await fetch("/api/ghl/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    if (!res.ok) throw new Error(`Proxy responded ${res.status}`);
    return { ok: true, message: `Sent to ${opts.to.length} contact(s) via GoHighLevel.` };
  } catch (e) {
    return { ok: false, message: `Could not reach the GHL proxy (${(e as Error).message}). Deploy /api/ghl/send to enable live sending.` };
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
  perPage: number; // how many results to pull (cap 25 to stay light)
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
  try {
    const res = await fetch("/api/apollo/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filters),
    });
    if (res.ok) {
      const j = (await res.json()) as { demo?: boolean; people?: ScrapedPerson[] };
      if (!j.demo && Array.isArray(j.people)) {
        return {
          live: true,
          people: j.people,
          message: `Found ${j.people.length} contact(s) via Apollo.io.`,
        };
      }
    }
  } catch {
    /* fall through to demo */
  }
  const people = demoScrape(filters);
  return {
    live: false,
    people,
    message: `Demo mode — showing ${people.length} sample contact(s). Deploy the Apollo proxy + set APOLLO_API_KEY to scrape live data.`,
  };
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

export function fmtEuro(n: number): string {
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}
