import type { LeadAi } from "@/lib/lead-filters";
import { useState, useEffect, useRef, Fragment } from "react";
import {
  Radar,
  MapPin,
  Search,
  Loader2,
  Unlock,
  Sparkles,
  Linkedin,
  Globe,
  Phone,
  Mail,
  ArrowRightCircle,
  Check,
  CheckSquare,
  Square,
  Building2,
  Download,
  X,
  Trash2,
  Gauge,
  BookmarkPlus,
  ArrowDownWideNarrow,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  Star,
  Info,
} from "lucide-react";
import {
  type AdminData,
  type RawBusiness,
  type ScrapeFilters,
  type ScrapedPerson,
  type GeocodeResult,
  type ScrapeSource,
  SENIORITIES,
  geocodeLocation,
  enrichContacts,
  discoverLeads,
  addToDenylist,
  restoreFromDenylist,
  denylistEntries,
  uid,
  authFetch,
} from "../store";
import { Panel, Field, inputCls, Btn } from "../ui";
import { SavedSearchesPanel, SaveSearchModal } from "./SavedSearches";
import { leadFilterReason, TEAM_SIZE_BANDS, REVENUE_BANDS } from "@/lib/lead-filters";

const SIZE_PRESETS: { id: string; label: string }[] = [
  { id: "1,10", label: "1–10" },
  { id: "11,20", label: "11–20" },
  { id: "21,50", label: "21–50" },
  { id: "51,100", label: "51–100" },
  { id: "101,200", label: "101–200" },
  { id: "201,500", label: "201–500" },
  { id: "501,1000", label: "501–1k" },
  { id: "1001,1000000", label: "1k+" },
];

const REVENUE_OPTS: { v: number; label: string }[] = [
  { v: 0, label: "Any revenue" },
  { v: 100000, label: "$100k+" },
  { v: 500000, label: "$500k+" },
  { v: 1000000, label: "$1M+" },
  { v: 5000000, label: "$5M+" },
  { v: 10000000, label: "$10M+" },
];

// Service-based local businesses that convert well for marketing agency outreach.
// Grouped for readability, flattened for the UI.
const KEYWORD_GROUPS: { group: string; keywords: string[] }[] = [
  {
    group: "Real Estate & Property",
    keywords: [
      "Real Estate",
      "Real Estate Agency",
      "Realtor",
      "Property Management",
      "Property Developer",
      "Commercial Real Estate",
      "Mortgage Broker",
      "Home Staging",
      "Property Inspector",
    ],
  },
  {
    group: "Home Services — Exterior",
    keywords: [
      "Roofing",
      "Roof Repair",
      "Solar Installation",
      "Gutter Cleaning",
      "Siding Contractor",
      "Window Installation",
      "Garage Door",
      "Fencing",
      "Deck Builder",
      "Concrete Contractor",
      "Paving",
      "Driveway Sealing",
      "Pressure Washing",
      "Chimney Sweep",
    ],
  },
  {
    group: "Home Services — Interior",
    keywords: [
      "Plumbing",
      "HVAC",
      "Electrician",
      "Handyman",
      "Painter",
      "Interior Designer",
      "Flooring",
      "Kitchen Remodel",
      "Bathroom Remodel",
      "Cabinet Maker",
      "Carpet Cleaning",
      "Junk Removal",
      "Moving Company",
      "Cleaning Service",
      "House Cleaning",
    ],
  },
  {
    group: "Outdoor & Landscaping",
    keywords: [
      "Landscaping",
      "Lawn Care",
      "Tree Specialists",
      "Tree Care",
      "Tree Removal",
      "Arborist",
      "Snow Removal",
      "Pool Service",
      "Pool Builder",
      "Irrigation",
      "Pest Control",
      "Fence Builder",
      "Hardscaping",
      "Garden Center",
      "Nursery",
    ],
  },
  {
    group: "Automotive",
    keywords: [
      "Auto Repair",
      "Auto Body Shop",
      "Car Detailing",
      "Tire Shop",
      "Car Dealership",
      "Used Car Dealer",
      "Motorcycle Dealer",
      "RV Dealer",
      "Boat Dealer",
      "Car Wash",
      "Windshield Repair",
      "Towing Service",
    ],
  },
  {
    group: "Health & Wellness",
    keywords: [
      "Dental",
      "Dental Clinic",
      "Orthodontist",
      "Chiropractor",
      "Physiotherapy",
      "Med Spa",
      "Cosmetic Surgery",
      "Dermatology",
      "Optometrist",
      "Veterinarian",
      "Mental Health Clinic",
      "Massage Therapy",
      "Acupuncture",
      "Nutritionist",
      "Personal Trainer",
      "Fitness",
      "Gym",
      "CrossFit",
      "Yoga Studio",
      "Pilates Studio",
    ],
  },
  {
    group: "Beauty",
    keywords: [
      "Salon",
      "Hair Salon",
      "Barber Shop",
      "Nail Salon",
      "Beauty Spa",
      "Tattoo Studio",
      "Lash Extensions",
      "Waxing Studio",
      "Tanning Salon",
    ],
  },
  {
    group: "Food & Hospitality",
    keywords: [
      "Restaurant",
      "Cafe",
      "Coffee Shop",
      "Bakery",
      "Catering",
      "Food Truck",
      "Bar",
      "Brewery",
      "Winery",
      "Hotel",
      "Bed and Breakfast",
      "Event Venue",
    ],
  },
  {
    group: "Professional Services",
    keywords: [
      "Law Firm",
      "Accountant",
      "CPA",
      "Bookkeeping",
      "Tax Preparation",
      "Financial Advisor",
      "Insurance Agency",
      "Notary",
      "Consulting",
      "Marketing Agency",
      "IT Services",
      "Managed IT",
      "Web Design Studio",
      "Security Company",
      "Printing Company",
    ],
  },
  {
    group: "Events, Photo & Creative",
    keywords: [
      "Wedding Photographer",
      "Photographer",
      "Videographer",
      "Wedding Planner",
      "Event Planner",
      "DJ Service",
      "Florist",
    ],
  },
  {
    group: "Trades & B2B",
    keywords: [
      "General Contractor",
      "Construction",
      "Welding",
      "Machine Shop",
      "Metal Fabrication",
      "Commercial Cleaning",
      "Janitorial",
      "Waste Management",
      "Logistics",
      "Trucking Company",
      "Warehousing",
    ],
  },
  {
    group: "Retail",
    keywords: [
      "Store",
      "Retail Store",
      "Boutique",
      "Jewelry Store",
      "Furniture Store",
      "Mattress Store",
      "Pet Store",
      "Bike Shop",
      "Sporting Goods",
      "Music Store",
    ],
  },
  {
    group: "Family & Education",
    keywords: [
      "Daycare",
      "Preschool",
      "Private Tutor",
      "Music School",
      "Dance Studio",
      "Martial Arts",
      "Driving School",
    ],
  },
];

/** One-click keyword bundles for the niche browser. Click = replace the selection. */
const PRESETS: { id: string; label: string; hint: string; keywords: string[] }[] = [
  {
    id: "home-exterior",
    label: "Home exterior",
    hint: "Roofing, siding, gutters, solar, fencing, concrete, paving",
    keywords: [
      "Roofing",
      "Siding Contractor",
      "Gutter Cleaning",
      "Solar Installation",
      "Fencing",
      "Concrete Contractor",
      "Paving",
      "Window Installation",
      "Garage Door",
    ],
  },
  {
    id: "home-interior",
    label: "Home interior",
    hint: "Plumbing, HVAC, electrical, remodels, flooring, cleaning",
    keywords: [
      "Plumbing",
      "HVAC",
      "Electrician",
      "Kitchen Remodel",
      "Bathroom Remodel",
      "Flooring",
      "Painter",
      "Handyman",
      "House Cleaning",
    ],
  },
  {
    id: "outdoor",
    label: "Outdoor & trees",
    hint: "Landscaping, tree service, lawn, irrigation, pest, pools",
    keywords: [
      "Landscaping",
      "Tree Service",
      "Tree Removal",
      "Arborist",
      "Lawn Care",
      "Irrigation",
      "Pest Control",
      "Pool Service",
      "Hardscaping",
    ],
  },
  {
    id: "high-ticket",
    label: "High-ticket home",
    hint: "Jobs worth $5k+: roofs, HVAC, solar, remodels, pools, foundation",
    keywords: [
      "Roofing",
      "HVAC",
      "Solar Installation",
      "Kitchen Remodel",
      "Bathroom Remodel",
      "Pool Builder",
      "Foundation Repair",
      "Basement Finishing",
      "Custom Home Builder",
    ],
  },
  {
    id: "health",
    label: "Health & wellness",
    hint: "Dentists, ortho, chiro, physio, med spas, vets",
    keywords: [
      "Dentist",
      "Orthodontist",
      "Chiropractor",
      "Physiotherapy",
      "Med Spa",
      "Dermatology",
      "Optometrist",
      "Veterinarian",
      "Massage Therapy",
    ],
  },
  {
    id: "professional",
    label: "Professional services",
    hint: "Law, accounting, insurance, financial advisors, IT",
    keywords: [
      "Law Firm",
      "Accountant",
      "CPA",
      "Bookkeeping",
      "Financial Advisor",
      "Insurance Agency",
      "IT Services",
      "Managed IT",
      "Consulting",
    ],
  },
  {
    id: "auto",
    label: "Automotive",
    hint: "Repair, body shops, detailing, tires, dealers",
    keywords: [
      "Auto Repair",
      "Auto Body Shop",
      "Car Detailing",
      "Tire Shop",
      "Used Car Dealer",
      "Windshield Repair",
      "Towing Service",
    ],
  },
  {
    id: "beauty-food",
    label: "Beauty & hospitality",
    hint: "Salons, spas, barbers, restaurants, venues",
    keywords: [
      "Hair Salon",
      "Barber Shop",
      "Nail Salon",
      "Beauty Spa",
      "Tattoo Studio",
      "Restaurant",
      "Catering",
      "Event Venue",
    ],
  },
  {
    id: "be-bouw",
    label: "🇧🇪 Bouw & renovatie",
    hint: "Dakwerkers, aannemers, loodgieters, elektriciens, tuinaanleg",
    keywords: [
      "Dakwerker",
      "Aannemer",
      "Loodgieter",
      "Elektricien",
      "Tuinaanleg",
      "Schrijnwerker",
      "Schilder",
      "Isolatie",
      "Ramen en deuren",
      "Verwarming",
    ],
  },
  {
    id: "be-zorg",
    label: "🇧🇪 Zorg & welzijn",
    hint: "Tandartsen, kinesisten, osteopaten, dierenartsen, schoonheid",
    keywords: [
      "Tandarts",
      "Kinesist",
      "Osteopaat",
      "Dierenarts",
      "Schoonheidssalon",
      "Kapper",
      "Opticien",
      "Podoloog",
    ],
  },
  {
    id: "be-diensten",
    label: "🇧🇪 Diensten",
    hint: "Boekhouders, advocaten, verzekeringen, vastgoed, garages",
    keywords: [
      "Boekhouder",
      "Advocaat",
      "Verzekeringsmakelaar",
      "Vastgoedkantoor",
      "Garage",
      "Carrosserie",
      "Notaris",
      "Rijschool",
    ],
  },
];

export function Scraper({
  data,
  update,
  go,
}: {
  data: AdminData;
  update: (fn: (p: AdminData) => AdminData) => void;
  go: (v: any) => void;
}) {
  const [filters, setFilters] = useState<ScrapeFilters>({
    location: "",
    titles: "",
    industry: "",
    seniorities: ["owner", "c_suite", "director"],
    perPage: 25,
    employeeRanges: [],
    minRevenue: 0,
    locationScope: "both",
    requireEmail: false,
    requirePhone: false,
  });
  const [geo, setGeo] = useState<GeocodeResult | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [scrapeBusy, setScrapeBusy] = useState(false);
  const saved = data.scraper;
  const [results, setResults] = useState<ScrapedPerson[]>(saved?.results ?? []);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [banner, setBanner] = useState<{ live: boolean; text: string } | null>(null);
  const [pushed, setPushed] = useState(0);
  const [revealPhone, setRevealPhone] = useState(false);
  const [enrichBusy, setEnrichBusy] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });
  // id -> which source revealed the email ("Apollo" | "Hunter" | "Google" | "demo")
  const [emailSource, setEmailSource] = useState<Record<string, string>>(saved?.emailSource ?? {});
  // id -> URL where the email was found (Hunter source / Google result link)
  const [emailSourceUrl, setEmailSourceUrl] = useState<Record<string, string>>(
    saved?.emailSourceUrl ?? {},
  );
  // id -> sources used to discover this row (apollo / google / claude)
  const [discoverSources, setDiscoverSources] = useState<Record<string, ScrapeSource[]>>(
    saved?.discoverSources ?? {},
  );

  // Which discovery sources to run
  const [sources, setSources] = useState<Record<ScrapeSource, boolean>>({
    apollo: false, // paid credits — opt in
    google: true, // Google Places free tier → Serper → SerpApi
    osm: true, // OpenStreetMap, free
    claude: true, // reads each website (fractions of a cent)
    apify: false, // bulk Google Maps walk — hundreds per search, a few $ per 1,000
  });
  // Paid reveal sources (Apollo / Hunter / SerpApi) are opt-in per run.
  const [usePaid, setUsePaid] = useState(false);
  const [scores, setScores] = useState<
    Record<
      string,
      {
        score: number;
        why: string[];
        ai?: LeadAi | null;
      }
    >
  >(saved?.scores ?? {});
  const [sortByScore, setSortByScore] = useState(true);
  const [showSave, setShowSave] = useState(false);
  const [savedRefresh, setSavedRefresh] = useState(0);
  const [aiProgress, setAiProgress] = useState({ done: 0, total: 0 });
  const [apifySeconds, setApifySeconds] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("");
  const [aiKeywords, setAiKeywords] = useState<string[]>([]);
  const [aiKwBusy, setAiKwBusy] = useState(false);
  const [aiKwError, setAiKwError] = useState<string | null>(null);
  const [nichesOpen, setNichesOpen] = useState(false);
  const [nicheQuery, setNicheQuery] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [areasOpen, setAreasOpen] = useState(false);
  const [areasBusy, setAreasBusy] = useState(false);
  const [areasCountry, setAreasCountry] = useState<"United States" | "Belgium" | "Netherlands">(
    "United States",
  );
  const [areas, setAreas] = useState<
    {
      area: string;
      state: string;
      why: string;
      estBusinesses: string;
      competition: string;
      season: string;
      searchAs: string;
    }[]
  >([]);
  const [areasErr, setAreasErr] = useState<string | null>(null);

  async function suggestAreas() {
    if (areasBusy) return;
    setAreasBusy(true);
    setAreasErr(null);
    try {
      const res = await authFetch("/api/claude/areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: filters.industry || "local service businesses",
          country: areasCountry,
          count: 12,
        }),
      });
      const j = (await res.json()) as { ok: boolean; areas?: typeof areas; reason?: string };
      if (!j.ok)
        setAreasErr(
          j.reason === "missing_key"
            ? "AI key not configured on the server."
            : j.reason || "No suggestions.",
        );
      else setAreas(j.areas ?? []);
    } catch (e) {
      setAreasErr((e as Error).message);
    } finally {
      setAreasBusy(false);
    }
  }
  const [nicheDraft, setNicheDraft] = useState("");

  async function suggestKeywordsWithAI() {
    if (aiKwBusy) return;
    setAiKwBusy(true);
    setAiKwError(null);
    try {
      const res = await authFetch("/api/claude/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: filters.location,
          seed: filters.industry,
          note: "Focus on high-ticket, service-based local businesses that pay for marketing.",
        }),
      });
      const j = (await res.json()) as { ok?: boolean; keywords?: string[]; reason?: string };
      if (!j.ok || !j.keywords?.length) {
        setAiKwError(
          j.reason === "missing_key"
            ? "AI key not configured on the server."
            : "AI didn't return suggestions. Try again.",
        );
      } else {
        setAiKeywords(j.keywords);
      }
    } catch (e) {
      setAiKwError((e as Error).message || "Request failed.");
    } finally {
      setAiKwBusy(false);
    }
  }

  const denylist = data.denylist ?? {};
  const history = denylistEntries(denylist);

  // Persist scraper state per-account so a page refresh keeps results.
  const firstSync = useRef(true);
  useEffect(() => {
    if (firstSync.current) {
      firstSync.current = false;
      return;
    }
    const snap = {
      results,
      emailSource,
      emailSourceUrl,
      discoverSources,
      scores,
      updatedAt: Date.now(),
    };
    update((prev) => ({ ...prev, scraper: snap }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, emailSource, emailSourceUrl, discoverSources, scores]);

  function persistDeny(people: ScrapedPerson[]) {
    if (!people.length) return;
    update((prev) =>
      addToDenylist(
        prev,
        "denied",
        people.map((p) => ({
          name: p.name,
          company: p.company,
          email: p.email,
          website: p.website,
        })),
      ),
    );
  }

  function denySelected() {
    const ids = new Set(Object.keys(selected).filter((id) => selected[id]));
    if (!ids.size) return;
    const toDeny = results.filter((p) => ids.has(p.id));
    persistDeny(toDeny);
    setResults((prev) => prev.filter((p) => !ids.has(p.id)));
    setSelected({});
  }

  function denyOne(id: string) {
    const target = results.find((p) => p.id === id);
    if (target) persistDeny([target]);
    setResults((prev) => prev.filter((p) => p.id !== id));
    setSelected((s) => {
      const { [id]: _omit, ...rest } = s;
      return rest;
    });
  }

  function acceptOne(id: string) {
    const p = results.find((x) => x.id === id);
    if (!p) return;
    const row: RawBusiness = {
      id: uid("r"),
      business: p.company,
      email: p.emailLocked ? "" : p.email,
      phone: p.phone,
      website: p.website,
      city: p.city,
      industry: p.industry,
      status: "raw",
      scrapedAt: Date.now(),
      contactName: p.name,
      contactTitle: p.title,
      seniority: p.seniority,
      linkedin: p.linkedin,
      source:
        (discoverSources[p.id] ?? []).map((s) => s[0].toUpperCase() + s.slice(1)).join("+") ||
        "Apollo",
    };
    update((prev) => {
      const withDenied = addToDenylist(prev, "accepted", [
        { name: p.name, company: p.company, email: p.email, website: p.website },
      ]);
      return { ...withDenied, raw: [row, ...withDenied.raw] };
    });
    setPushed((driven) => driven + 1);
    setResults((prev) => prev.filter((x) => x.id !== id));
    setSelected((s) => {
      const { [id]: _omit, ...rest } = s;
      return rest;
    });
  }

  function clearAllResults() {
    if (!results.length) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Remove all ${results.length} scraped contacts?`)
    )
      return;
    setResults([]);
    setSelected({});
    setEmailSource({});
    setEmailSourceUrl({});
    setBanner(null);
  }

  function splitName(name: string): { first: string; last: string } {
    const parts = name.trim().split(/\s+/);
    return { first: parts[0] || "", last: parts.length > 1 ? parts.slice(1).join(" ") : "" };
  }

  function prettyHost(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }

  // Keywords are stored in filters.industry as a comma-separated string.
  const activeKeywords = filters.industry
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  function toggleKeyword(kw: string) {
    const list = filters.industry
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const exists = list.some((k) => k.toLowerCase() === kw.toLowerCase());
    const next = exists ? list.filter((k) => k.toLowerCase() !== kw.toLowerCase()) : [...list, kw];
    setFilters({ ...filters, industry: next.join(", ") });
  }

  async function revealEmails(targets: ScrapedPerson[]) {
    // Enrich anyone missing an email OR a website (Apollo finds both; Google/Hunter fill gaps).
    const list = targets.filter((p) => p.emailLocked || !p.email || !p.website);
    if (!list.length) return;
    setEnrichBusy(true);
    setEnrichProgress({ done: 0, total: list.length });

    const updates: Record<
      string,
      {
        email: string;
        phone: string;
        website: string;
        source: string;
        sourceUrl: string;
        name: string;
        title: string;
        linkedin: string;
        guessed: boolean;
        score?: number;
        scoreReasons?: string[];
        ai?: LeadAi | null;
      }
    > = {};
    // Batches of 8, three in flight at once: each batch is its own Worker
    // invocation (own connection budget), so this is ~3x faster than serial.
    const BATCH = 8;
    const PARALLEL = 3;
    const chunks: ScrapedPerson[][] = [];
    for (let i = 0; i < list.length; i += BATCH) chunks.push(list.slice(i, i + BATCH));
    let done = 0;
    const runChunk = async (chunk: ScrapedPerson[]) => {
      const payload = chunk.map((p) => {
        const { first, last } = splitName(p.name);
        return {
          id: p.id,
          name: p.name,
          firstName: first,
          lastName: last,
          domain: p.website,
          organizationName: p.company,
          linkedin: p.linkedin,
          rating: p.rating,
          reviews: p.reviews,
          phone: p.phone,
        };
      });
      const res = await enrichContacts(payload, revealPhone, usePaid, sources.claude).catch(
        () => [] as Awaited<ReturnType<typeof enrichContacts>>,
      );
      res.forEach((r) => {
        if (r.id)
          updates[r.id] = {
            email: r.email,
            phone: r.phone,
            website: r.website,
            source: r.source,
            sourceUrl: r.sourceUrl,
            name: r.name || "",
            title: r.title || "",
            linkedin: r.linkedin || "",
            guessed: !!r.guessed,
            score: r.score,
            scoreReasons: r.scoreReasons,
            ai: r.ai ?? null,
          };
      });
      done += chunk.length;
      setEnrichProgress({ done: Math.min(done, list.length), total: list.length });
    };
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(PARALLEL, chunks.length) }, async () => {
        while (next < chunks.length) await runChunk(chunks[next++]);
      }),
    );

    setResults((prev) =>
      prev.map((p) => {
        const u = updates[p.id];
        if (!u) return p;
        return {
          ...p,
          email: u.email || p.email,
          emailLocked: u.email ? false : p.emailLocked,
          phone: u.phone || p.phone,
          website: u.website || p.website,
          name: p.name || u.name,
          title: p.title || u.title,
          linkedin: p.linkedin || u.linkedin,
        };
      }),
    );
    setEmailSource((prev) => {
      const next = { ...prev };
      Object.entries(updates).forEach(([id, u]) => {
        if (u.email) next[id] = u.guessed ? "Guess" : u.source || "Website";
      });
      return next;
    });
    setScores((prev) => {
      const next = { ...prev };
      Object.entries(updates).forEach(([id, u]) => {
        if (typeof u.score === "number")
          next[id] = { score: u.score, why: u.scoreReasons ?? [], ai: u.ai ?? null };
      });
      return next;
    });
    setEmailSourceUrl((prev) => {
      const next = { ...prev };
      Object.entries(updates).forEach(([id, u]) => {
        if (u.email && u.sourceUrl) next[id] = u.sourceUrl;
      });
      return next;
    });
    setEnrichBusy(false);
  }

  function toggleSeniority(id: string) {
    setFilters((f) => ({
      ...f,
      seniorities: f.seniorities.includes(id)
        ? f.seniorities.filter((s) => s !== id)
        : [...f.seniorities, id],
    }));
  }

  function toggleEmployeeRange(id: string) {
    setFilters((f) => {
      const cur = f.employeeRanges ?? [];
      return {
        ...f,
        employeeRanges: cur.includes(id) ? cur.filter((r) => r !== id) : [...cur, id],
      };
    });
  }

  async function locate(loc: string = filters.location) {
    if (!loc.trim()) return;
    setGeoBusy(true);
    const g = await geocodeLocation(loc);
    setGeo(g);
    setGeoBusy(false);
  }

  async function runScrape() {
    if (!filters.location.trim()) return;
    if (!sources.apollo && !sources.google && !sources.osm && !sources.apify) {
      setBanner({ live: false, text: "Pick at least one discovery source." });
      return;
    }
    setScrapeBusy(true);
    setBanner(null);
    setPushed(0);
    setAiProgress({ done: 0, total: 0 });
    let g = geo;
    if (!g) {
      setGeoBusy(true);
      g = await geocodeLocation(filters.location);
      setGeo(g);
      setGeoBusy(false);
    }
    const bandToApollo: Record<string, string> = {
      "1-10": "1,10",
      "11-50": "11,50",
      "51-200": "51,200",
      "200+": "201,1000000",
    };
    const apolloRanges = (filters.teamSizes ?? []).map((b) => bandToApollo[b]).filter(Boolean);
    const res = await discoverLeads(
      { ...filters, employeeRanges: apolloRanges },
      {
        sources,
        denylist,
        geo: g,
        onProgress: (phase, done, total) => {
          if (phase === "ai") setAiProgress({ done, total });
          if (phase === "apify") setApifySeconds(done);
        },
      },
    );
    setResults(res.people);
    setDiscoverSources(res.sources);
    setSelected(Object.fromEntries(res.people.map((p) => [p.id, true])));
    setBanner({ live: res.liveApollo || res.liveGoogle, text: res.message });
    setScrapeBusy(false);
    setAiProgress({ done: 0, total: 0 });
    setApifySeconds(0);
    // Reveal emails for Apollo-discovered rows that don't yet have one
    const needsReveal = res.people.filter((p) => p.emailLocked || !p.email || !p.website);
    if ((res.liveApollo || res.liveGoogle) && needsReveal.length) {
      await revealEmails(needsReveal);
    }
  }

  const selectedPeople = results.filter((p) => selected[p.id]);
  const scoreOf = (p: ScrapedPerson) => scores[p.id]?.score ?? -1;
  function toggleIn(key: "teamSizes" | "revenueBands", v: string) {
    setFilters((f) => {
      const cur = f[key] ?? [];
      return { ...f, [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });
  }
  const filterSpec = {
    seniorities: filters.seniorities,
    teamSizes: filters.teamSizes,
    revenueBands: filters.revenueBands,
  };
  const hiddenReason = (p: ScrapedPerson): string | null =>
    leadFilterReason(
      {
        title: p.title || scores[p.id]?.ai?.title,
        teamSize: scores[p.id]?.ai?.teamSize,
        revenueBand: scores[p.id]?.ai?.revenueBand,
      },
      filterSpec,
    );
  const visibleResults = showHidden ? results : results.filter((p) => !hiddenReason(p));
  const hiddenCount = results.length - results.filter((p) => !hiddenReason(p)).length;
  const ordered = sortByScore
    ? [...visibleResults].sort((a, b) => scoreOf(b) - scoreOf(a))
    : visibleResults;
  const scoredCount = results.filter((p) => scores[p.id]).length;

  function selectTop(fraction: number) {
    const ranked = [...results].sort((a, b) => scoreOf(b) - scoreOf(a));
    const n = Math.max(1, Math.round(ranked.length * fraction));
    setSelected(Object.fromEntries(ranked.slice(0, n).map((p) => [p.id, true])));
  }

  function sendToRaw() {
    if (!selectedPeople.length) return;
    const rows: RawBusiness[] = selectedPeople.map((p) => ({
      id: uid("r"),
      business: p.company,
      email: p.emailLocked ? "" : p.email,
      phone: p.phone,
      website: p.website,
      city: p.city,
      industry: p.industry,
      status: "raw",
      scrapedAt: Date.now(),
      contactName: p.name,
      contactTitle: p.title,
      seniority: p.seniority,
      linkedin: p.linkedin,
      source:
        (discoverSources[p.id] ?? []).map((s) => s[0].toUpperCase() + s.slice(1)).join("+") ||
        "Apollo",
      emailSource: emailSource[p.id],
      rating: p.rating,
      reviews: p.reviews,
      score: scores[p.id]?.score,
      scoreWhy: scores[p.id]?.why,
      ai: scores[p.id]?.ai ?? null,
    }));
    update((prev) => {
      const withDenied = addToDenylist(
        prev,
        "accepted",
        selectedPeople.map((p) => ({
          name: p.name,
          company: p.company,
          email: p.email,
          website: p.website,
        })),
      );
      return { ...withDenied, raw: [...rows, ...withDenied.raw] };
    });
    setPushed(rows.length);
    const acceptedIds = new Set(selectedPeople.map((p) => p.id));
    setResults((prev) => prev.filter((p) => !acceptedIds.has(p.id)));
    setSelected({});
  }

  function exportCSV(rows: ScrapedPerson[]) {
    const header = [
      "First Name",
      "Last Name",
      "Email",
      "Phone",
      "Title",
      "Seniority",
      "Company",
      "Website",
      "LinkedIn URL",
      "City",
      "Industry",
    ];
    const lines = rows.map((p) => {
      const [first, ...rest] = p.name.trim().split(/\s+/);
      const last = rest.join(" ");
      const cells = [
        first || "",
        last || "",
        p.email || "",
        p.phone || "",
        p.title || "",
        p.seniority || "",
        p.company || "",
        p.website || "",
        p.linkedin || "",
        p.city || "",
        p.industry || "",
      ];
      return cells.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",");
    });
    const csv = [header.join(","), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `apollo-export-${rows.length}-contacts.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // OpenStreetMap embed (no key needed): bbox + marker
  const mapSrc = geo
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${geo.bbox[2]}%2C${geo.bbox[0]}%2C${geo.bbox[3]}%2C${geo.bbox[1]}&layer=mapnik&marker=${geo.lat}%2C${geo.lng}`
    : "";

  const selectedKeywordLabels = filters.industry
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const nicheMatches = nicheQuery.trim()
    ? KEYWORD_GROUPS.map((g) => ({
        ...g,
        keywords: g.keywords.filter((k) =>
          k.toLowerCase().includes(nicheQuery.trim().toLowerCase()),
        ),
      })).filter((g) => g.keywords.length)
    : KEYWORD_GROUPS;
  function addNicheDraft() {
    const v = nicheDraft.trim().replace(/,$/, "");
    if (!v) return;
    if (!activeKeywords.includes(v.toLowerCase())) toggleKeyword(v);
    setNicheDraft("");
  }
  const withEmail = results.filter((p) => p.email && !p.emailLocked).length;
  const scoredList = results
    .map((p) => scores[p.id]?.score)
    .filter((n): n is number => typeof n === "number");
  const avgScore = scoredList.length
    ? Math.round(scoredList.reduce((a, b) => a + b, 0) / scoredList.length)
    : null;
  const bands = {
    strong: scoredList.filter((n) => n >= 70).length,
    ok: scoredList.filter((n) => n >= 45 && n < 70).length,
    weak: scoredList.filter((n) => n < 45).length,
  };
  const sourceTotals = Object.values(discoverSources).reduce(
    (acc, arr) => {
      arr.forEach((s) => (acc[s] = (acc[s] ?? 0) + 1));
      return acc;
    },
    {} as Record<string, number>,
  );
  const bandCls = (n: number) =>
    n >= 70
      ? "bg-[oklch(.62_.17_150)]"
      : n >= 45
        ? "bg-[oklch(.78_.15_80)]"
        : "bg-[oklch(.8_.02_290)]";
  const pill = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
      on
        ? "border-transparent bg-[var(--brand-violet)] text-white"
        : "border-border bg-background text-muted-foreground hover:bg-secondary"
    }`;
  const busy = scrapeBusy || enrichBusy;

  return (
    <div className="space-y-5">
      {/* Command bar */}
      <Panel className="!p-0 overflow-hidden">
        <div className="grid gap-3 p-4 lg:grid-cols-[1.1fr_1.5fr_auto_auto] lg:items-end">
          <Field label="Where">
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className={inputCls + " pl-9 pr-20"}
                value={filters.location}
                onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && void locate()}
                placeholder="City, region or address"
              />
              <button
                onClick={() => void locate()}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-secondary"
              >
                {geoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Locate"}
              </button>
            </div>
          </Field>

          <Field label="What kind of business">
            <div
              className={
                inputCls + " flex min-h-[42px] flex-wrap items-center gap-1.5 py-1.5 cursor-text"
              }
              onClick={(e) =>
                (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()
              }
            >
              {selectedKeywordLabels.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-violet)]/12 px-2.5 py-0.5 text-xs font-semibold text-[var(--brand-violet)]"
                >
                  {kw}
                  <button
                    onClick={() => toggleKeyword(kw)}
                    aria-label={`Remove ${kw}`}
                    className="opacity-70 hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                className="min-w-[120px] flex-1 bg-transparent text-sm outline-none"
                value={nicheDraft}
                onChange={(e) => setNicheDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addNicheDraft();
                  } else if (e.key === "Backspace" && !nicheDraft && selectedKeywordLabels.length) {
                    toggleKeyword(selectedKeywordLabels[selectedKeywordLabels.length - 1]);
                  }
                }}
                onBlur={addNicheDraft}
                placeholder={
                  selectedKeywordLabels.length ? "Add another…" : "Roofing, dentist, tree service…"
                }
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setNichesOpen((v) => !v);
                }}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-secondary"
              >
                Browse{" "}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${nichesOpen ? "rotate-180" : ""}`}
                />
              </button>
            </div>
          </Field>

          <Field label="How many">
            <select
              className={inputCls + " w-24"}
              value={filters.perPage}
              onChange={(e) => setFilters({ ...filters, perPage: Number(e.target.value) })}
            >
              {(sources.apify ? [50, 100, 200, 300, 500, 1000] : [25, 50, 100, 200, 500]).map(
                (n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ),
              )}
            </select>
          </Field>

          <div className="flex gap-2">
            <Btn onClick={runScrape} disabled={busy || !filters.location.trim()} className="px-5">
              {scrapeBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Radar className="h-4 w-4" />
              )}
              {scrapeBusy
                ? apifySeconds
                  ? `Apify walking the map… ${apifySeconds}s`
                  : aiProgress.total
                    ? `Reading sites ${aiProgress.done}/${aiProgress.total}`
                    : "Finding…"
                : "Find businesses"}
            </Btn>
            <Btn
              variant="ghost"
              onClick={() => setShowSave(true)}
              disabled={!filters.location.trim()}
              title="Save as a search that re-runs itself and can auto-enrol new leads"
            >
              <BookmarkPlus className="h-4 w-4" />
            </Btn>
          </div>
        </div>

        {/* Niche browser */}
        {nichesOpen && (
          <div className="border-t border-border bg-secondary/40 p-4">
            <div className="mb-3">
              <div className="mb-1 text-[.7rem] font-semibold text-muted-foreground">
                Presets{" "}
                <span className="font-normal">
                  (click to select the whole bundle; add or remove single niches below)
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((pr) => {
                  const on =
                    pr.keywords.length > 0 &&
                    pr.keywords.every((k) => activeKeywords.includes(k.toLowerCase())) &&
                    activeKeywords.length === pr.keywords.length;
                  return (
                    <button
                      key={pr.id}
                      onClick={() =>
                        setFilters({ ...filters, industry: on ? "" : pr.keywords.join(", ") })
                      }
                      title={pr.hint}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        on
                          ? "border-transparent bg-[var(--brand-coral)] text-white"
                          : "border-border bg-background text-foreground hover:bg-secondary"
                      }`}
                    >
                      {pr.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                className={inputCls + " max-w-xs"}
                placeholder="Filter niches…"
                value={nicheQuery}
                onChange={(e) => setNicheQuery(e.target.value)}
                autoFocus
              />
              <button
                onClick={suggestKeywordsWithAI}
                disabled={aiKwBusy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-secondary disabled:opacity-60"
              >
                {aiKwBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-[var(--brand-violet)]" />
                )}
                Suggest niches for this area
              </button>
              {aiKwError && <span className="text-xs text-destructive">{aiKwError}</span>}
              <span className="ml-auto text-xs text-muted-foreground">
                {selectedKeywordLabels.length} selected · searched together
              </span>
            </div>
            {aiKeywords.length > 0 && (
              <div className="mb-3">
                <div className="mb-1 text-xs font-semibold text-[var(--brand-violet)]">
                  Suggested
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {aiKeywords.map((kw) => (
                    <button
                      key={`ai-${kw}`}
                      onClick={() => toggleKeyword(kw)}
                      className={pill(activeKeywords.includes(kw.toLowerCase()))}
                    >
                      {kw}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid max-h-[400px] gap-x-6 gap-y-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              {nicheMatches.map((g) => (
                <div key={g.group}>
                  <div className="mb-1 text-xs font-semibold text-foreground">{g.group}</div>
                  <div className="flex flex-wrap gap-1">
                    {g.keywords.map((kw) => {
                      const on = activeKeywords.includes(kw.toLowerCase());
                      return (
                        <button
                          key={kw}
                          onClick={() => toggleKeyword(kw)}
                          className={`rounded-md px-2 py-1 text-[.72rem] ${
                            on
                              ? "bg-[var(--brand-violet)] font-semibold text-white"
                              : "bg-background text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {kw}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Options row */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
          <span className="text-xs text-muted-foreground">Sources</span>
          {(
            [
              { id: "google", label: "Google Maps" },
              { id: "osm", label: "OpenStreetMap" },
              { id: "claude", label: "Read each website" },
              { id: "apify", label: "Apify bulk (hundreds per search)" },
              { id: "apollo", label: "Apollo (paid)" },
            ] as { id: ScrapeSource; label: string }[]
          ).map((s) => (
            <button
              key={s.id}
              onClick={() => setSources({ ...sources, [s.id]: !sources[s.id] })}
              className={pill(sources[s.id])}
            >
              {s.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          <button
            onClick={() => setRevealPhone((v) => !v)}
            className={pill(revealPhone)}
            title="Also look up phone numbers"
          >
            Phones
          </button>
          <button
            onClick={() => setFilters({ ...filters, includeSeen: !filters.includeSeen })}
            className={pill(!filters.includeSeen)}
            title="Hide businesses that any earlier scan already returned, or that are already in Leads"
          >
            Only new
          </button>
          <button
            onClick={() => setUsePaid((v) => !v)}
            className={pill(usePaid)}
            title="Use Apollo / Hunter / SerpApi credits for contacts the free pass can't resolve"
          >
            Paid fallback
          </button>
          <button
            onClick={() => {
              setAreasOpen((v) => !v);
              if (!areas.length && !areasOpen) void suggestAreas();
            }}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
            title="Which areas are worth prospecting for this niche"
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--brand-violet)]" /> Area ideas
          </button>
          <button
            onClick={() => setOptionsOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> More filters
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${optionsOpen ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {areasOpen && (
          <div className="border-t border-border bg-secondary/40 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                Where to prospect for {filters.industry || "local service businesses"}
              </span>
              <select
                className={inputCls.replace("w-full", "") + " w-40 py-1.5 text-xs"}
                value={areasCountry}
                onChange={(e) => setAreasCountry(e.target.value as typeof areasCountry)}
              >
                <option>United States</option>
                <option>Belgium</option>
                <option>Netherlands</option>
              </select>
              <Btn variant="ghost" onClick={() => void suggestAreas()} disabled={areasBusy}>
                {areasBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {areas.length ? "Refresh" : "Suggest areas"}
              </Btn>
              {areasErr && <span className="text-xs text-destructive">{areasErr}</span>}
              <span className="ml-auto text-xs text-muted-foreground">
                Ranked by independent businesses, growth, ticket size and how crowded the agency
                market is. Opinion, not a dataset.
              </span>
            </div>
            {areas.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {areas.map((a, i) => (
                  <div
                    key={a.area}
                    className="flex flex-col gap-1.5 rounded-xl border border-border bg-background p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-bold">
                        {i + 1}. {a.area}
                      </span>
                      <span
                        className={`ml-auto rounded-full px-2 py-0.5 text-[.6rem] font-bold uppercase tracking-wide ${
                          a.competition === "low"
                            ? "bg-[oklch(.7_.18_150)]/15 text-[oklch(.4_.12_150)]"
                            : a.competition === "high"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-[oklch(.8_.16_80)]/25 text-[oklch(.45_.1_70)]"
                        }`}
                      >
                        {a.competition || "?"} competition
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{a.why}</p>
                    <div className="text-[.7rem] text-muted-foreground">
                      {a.estBusinesses && <span>{a.estBusinesses} businesses</span>}
                      {a.season && <span> · best: {a.season}</span>}
                    </div>
                    <button
                      onClick={() => {
                        setFilters({ ...filters, location: a.searchAs });
                        setGeo(null);
                        setAreasOpen(false);
                        void locate(a.searchAs);
                      }}
                      className="mt-1 self-start rounded-md border border-border px-2 py-1 text-xs font-semibold text-primary hover:bg-secondary"
                    >
                      Use this area →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {optionsOpen && (
          <div className="grid gap-4 border-t border-border bg-secondary/40 p-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  Must have
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setFilters({ ...filters, requireEmail: !filters.requireEmail })}
                    className={pill(!!filters.requireEmail)}
                  >
                    Email address
                  </button>
                  <button
                    onClick={() => setFilters({ ...filters, requirePhone: !filters.requirePhone })}
                    className={pill(!!filters.requirePhone)}
                  >
                    Direct phone
                  </button>
                </div>
              </div>
              <Field label="Job titles to look for on the website (optional)">
                <input
                  className={inputCls}
                  value={filters.titles}
                  onChange={(e) => setFilters({ ...filters, titles: e.target.value })}
                  placeholder="Owner, Founder, Managing Director"
                />
              </Field>
            </div>
            <div className="space-y-3">
              <div className="text-xs font-semibold text-muted-foreground">
                Filters — every source{" "}
                <span className="font-normal">
                  (size and revenue are estimated from the website; rows we can't judge stay)
                </span>
              </div>
              <div>
                <span className="mb-1 block text-[.7rem] text-muted-foreground">
                  Decision-maker title
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SENIORITIES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => toggleSeniority(s.id)}
                      className={pill(filters.seniorities.includes(s.id))}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-1 block text-[.7rem] text-muted-foreground">
                  Team size (estimated)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {TEAM_SIZE_BANDS.map((b) => (
                    <button
                      key={b}
                      onClick={() => toggleIn("teamSizes", b)}
                      className={pill((filters.teamSizes ?? []).includes(b))}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-1 block text-[.7rem] text-muted-foreground">
                  Revenue (estimated, USD/yr)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {REVENUE_BANDS.map((b) => (
                    <button
                      key={b}
                      onClick={() => toggleIn("revenueBands", b)}
                      className={pill((filters.revenueBands ?? []).includes(b))}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="Within">
                  <select
                    className={inputCls}
                    value={filters.radiusKm ?? 0}
                    onChange={(e) => setFilters({ ...filters, radiusKm: Number(e.target.value) })}
                  >
                    <option value={0}>Any distance</option>
                    {[5, 10, 25, 50, 100].map((k) => (
                      <option key={k} value={k}>
                        {k} km
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Min rating">
                  <select
                    className={inputCls}
                    value={filters.minRating ?? 0}
                    onChange={(e) => setFilters({ ...filters, minRating: Number(e.target.value) })}
                  >
                    <option value={0}>Any</option>
                    {[3, 3.5, 4, 4.5].map((r) => (
                      <option key={r} value={r}>
                        {r}★ +
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Min reviews">
                  <select
                    className={inputCls}
                    value={filters.minReviews ?? 0}
                    onChange={(e) => setFilters({ ...filters, minReviews: Number(e.target.value) })}
                  >
                    <option value={0}>Any</option>
                    {[5, 10, 25, 50, 100].map((n) => (
                      <option key={n} value={n}>
                        {n}+
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Max reviews (skip chains)">
                  <select
                    className={inputCls}
                    value={filters.maxReviews ?? 0}
                    onChange={(e) => setFilters({ ...filters, maxReviews: Number(e.target.value) })}
                  >
                    <option value={0}>Any</option>
                    {[100, 250, 500, 1000, 2500].map((n) => (
                      <option key={n} value={n}>
                        under {n}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {sources.apollo && (
                <p className="text-[.7rem] text-muted-foreground">
                  Apollo is on: title and size are also sent to Apollo as its own filters.
                </p>
              )}
            </div>
          </div>
        )}
      </Panel>

      {banner && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${
            banner.live
              ? "border-[oklch(.7_.18_150/.4)] bg-[oklch(.7_.18_150/.08)] text-[oklch(.4_.12_150)]"
              : "border-[oklch(.7_.16_60/.4)] bg-[oklch(.8_.16_80/.1)] text-[oklch(.45_.1_70)]"
          }`}
        >
          <span
            className={`rounded-full px-2 py-0.5 text-[.65rem] font-bold uppercase tracking-wider text-white ${banner.live ? "bg-[oklch(.7_.18_150)]" : "bg-[oklch(.75_.16_70)]"}`}
          >
            {banner.live ? "Live" : "Demo"}
          </span>
          {banner.text}
        </div>
      )}

      {pushed > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm">
          <CheckSquare className="h-4 w-4 text-[oklch(.6_.15_150)]" />
          {pushed} added to Raw Data.
          <button onClick={() => go("raw")} className="font-semibold text-primary hover:underline">
            Open Raw Data
          </button>
        </div>
      )}

      {/* Results + rail */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          {results.length > 0 ? (
            <Panel className="!p-0 overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <div className="mr-2">
                  <div className="font-display text-base font-bold">
                    {results.length} businesses
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {withEmail} with email{avgScore !== null ? ` · avg score ${avgScore}` : ""}
                      {hiddenCount > 0 && (
                        <>
                          {" · "}
                          <button
                            onClick={() => setShowHidden((v) => !v)}
                            className="text-primary hover:underline"
                            title="Rows whose title, estimated size or revenue contradict your filters"
                          >
                            {showHidden
                              ? `showing ${hiddenCount} filtered`
                              : `${hiddenCount} hidden by filters`}
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                  {scoredList.length > 0 && (
                    <div
                      className="mt-1 flex h-1.5 w-56 overflow-hidden rounded-full bg-secondary"
                      title={`${bands.strong} strong · ${bands.ok} ok · ${bands.weak} weak`}
                    >
                      <span
                        className="bg-[oklch(.62_.17_150)]"
                        style={{ width: `${(bands.strong / scoredList.length) * 100}%` }}
                      />
                      <span
                        className="bg-[oklch(.78_.15_80)]"
                        style={{ width: `${(bands.ok / scoredList.length) * 100}%` }}
                      />
                      <span
                        className="bg-[oklch(.8_.02_290)]"
                        style={{ width: `${(bands.weak / scoredList.length) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  {scoredCount > 0 && (
                    <>
                      <Btn
                        variant="ghost"
                        onClick={() => selectTop(0.4)}
                        title="Select the best-scoring 40%"
                      >
                        <Gauge className="h-4 w-4" /> Top 40%
                      </Btn>
                      <Btn
                        variant="ghost"
                        onClick={() => setSortByScore((v) => !v)}
                        title="Toggle score ordering"
                      >
                        <ArrowDownWideNarrow className="h-4 w-4" />{" "}
                        {sortByScore ? "By score" : "As found"}
                      </Btn>
                    </>
                  )}
                  <Btn
                    variant="ghost"
                    onClick={() => revealEmails(selectedPeople)}
                    disabled={enrichBusy || !selectedPeople.length}
                  >
                    {enrichBusy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> {enrichProgress.done}/
                        {enrichProgress.total}
                      </>
                    ) : (
                      <>
                        <Unlock className="h-4 w-4" /> Reveal
                      </>
                    )}
                  </Btn>
                  <Btn
                    variant="ghost"
                    onClick={() => exportCSV(selectedPeople)}
                    disabled={!selectedPeople.length}
                    title="Download CSV"
                  >
                    <Download className="h-4 w-4" />
                  </Btn>
                  <Btn
                    variant="danger"
                    onClick={denySelected}
                    disabled={!selectedPeople.length}
                    title="Deny selected"
                  >
                    <X className="h-4 w-4" />
                  </Btn>
                  <Btn onClick={sendToRaw} disabled={!selectedPeople.length}>
                    <ArrowRightCircle className="h-4 w-4" /> Accept {selectedPeople.length || ""}
                  </Btn>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="w-10 px-3 py-2">
                        <button
                          onClick={() =>
                            setSelected(
                              selectedPeople.length === results.length
                                ? {}
                                : Object.fromEntries(results.map((p) => [p.id, true])),
                            )
                          }
                          aria-label="Select all"
                          className="text-primary"
                        >
                          {selectedPeople.length === results.length ? (
                            <CheckSquare className="h-4 w-4" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </th>
                      <th className="w-28 min-w-[112px] px-2 py-2 font-medium">Score</th>
                      <th className="min-w-[190px] px-3 py-2 font-medium">Business</th>
                      <th className="min-w-[150px] px-3 py-2 font-medium">Contact</th>
                      <th className="min-w-[220px] px-3 py-2 font-medium">Email</th>
                      <th className="w-20 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {ordered.map((p) => {
                      const on = !!selected[p.id];
                      const sc = scores[p.id];
                      const open = expanded === p.id;
                      return (
                        <Fragment key={p.id}>
                          <tr
                            className={`border-b border-border/70 align-top ${on ? "bg-primary/[.04]" : "hover:bg-secondary/40"}`}
                          >
                            <td className="px-3 py-2.5">
                              <button
                                onClick={() => setSelected((s) => ({ ...s, [p.id]: !on }))}
                                aria-label="select"
                                className="text-primary"
                              >
                                {on ? (
                                  <CheckSquare className="h-4 w-4" />
                                ) : (
                                  <Square className="h-4 w-4 text-muted-foreground" />
                                )}
                              </button>
                            </td>
                            <td className="px-2 py-2.5">
                              {sc ? (
                                <button
                                  onClick={() => setExpanded(open ? null : p.id)}
                                  className="group flex w-full items-center gap-2"
                                  title="Why this score"
                                >
                                  <span className="w-7 text-right font-display text-sm font-bold tabular-nums">
                                    {sc.score}
                                  </span>
                                  <span className="h-1.5 min-w-[44px] flex-1 overflow-hidden rounded-full bg-secondary">
                                    <span
                                      className={`block h-full rounded-full ${bandCls(sc.score)}`}
                                      style={{ width: `${sc.score}%` }}
                                    />
                                  </span>
                                  <ChevronRight
                                    className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
                                  />
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-semibold">{p.company}</div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                {p.website && (
                                  <a
                                    href={`https://${p.website}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-primary hover:underline"
                                  >
                                    <Globe className="h-3 w-3" /> {p.website}
                                  </a>
                                )}
                                {typeof p.rating === "number" && (
                                  <span className="inline-flex items-center gap-0.5">
                                    <Star className="h-3 w-3 fill-current text-[oklch(.78_.15_80)]" />{" "}
                                    {p.rating}
                                    {p.reviews ? ` (${p.reviews})` : ""}
                                  </span>
                                )}
                                {(discoverSources[p.id] ?? []).map((s) => (
                                  <span
                                    key={s}
                                    className="rounded bg-secondary px-1 py-px text-[.6rem] font-semibold uppercase tracking-wide"
                                  >
                                    {s === "claude"
                                      ? "AI"
                                      : s === "google"
                                        ? "Maps"
                                        : s === "apify"
                                          ? "Bulk"
                                          : s}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div
                                className={`flex items-center gap-1 whitespace-nowrap ${p.name ? "font-medium" : "italic text-muted-foreground"}`}
                              >
                                {p.name || "No name yet"}
                                {p.linkedin && (
                                  <a
                                    href={p.linkedin}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[#0a66c2]"
                                    aria-label="LinkedIn"
                                  >
                                    <Linkedin className="h-3.5 w-3.5" />
                                  </a>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">{p.title}</div>
                              {p.phone && (
                                <div className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
                                  <Phone className="h-3 w-3" /> {p.phone}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {p.emailLocked || !p.email ? (
                                <button
                                  onClick={() => revealEmails([p])}
                                  disabled={enrichBusy}
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold text-primary hover:bg-secondary disabled:opacity-50"
                                >
                                  <Sparkles className="h-3 w-3" /> Reveal
                                </button>
                              ) : (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="break-words font-mono text-xs [overflow-wrap:anywhere]">
                                    {p.email}
                                  </span>
                                  {emailSource[p.id] && (
                                    <span
                                      className={`rounded px-1 py-px text-[.6rem] font-semibold uppercase tracking-wide ${
                                        emailSource[p.id] === "Guess"
                                          ? "bg-[oklch(.8_.16_80)]/25 text-[oklch(.45_.1_70)]"
                                          : "bg-secondary text-muted-foreground"
                                      }`}
                                      title={emailSourceUrl[p.id] || emailSource[p.id]}
                                    >
                                      {emailSource[p.id]}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2.5">
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() => acceptOne(p.id)}
                                  aria-label="Accept"
                                  title="Accept → Raw Data"
                                  className="grid h-7 w-7 place-items-center rounded-md border border-border text-[oklch(.55_.15_150)] hover:bg-[oklch(.95_.04_150)]"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => denyOne(p.id)}
                                  aria-label="Deny"
                                  title="Deny & never show again"
                                  className="grid h-7 w-7 place-items-center rounded-md border border-border text-[oklch(.55_.2_25)] hover:bg-[oklch(.95_.04_25)]"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {open && sc && (
                            <tr className="border-b border-border/70 bg-secondary/30">
                              <td />
                              <td colSpan={5} className="px-3 py-2">
                                {sc.ai && (
                                  <div className="mb-1.5 text-xs">
                                    <span className="font-semibold text-foreground">
                                      Needs marketing help: {sc.ai.need}/100
                                    </span>
                                    {sc.ai.gap && (
                                      <span className="text-muted-foreground">
                                        {" "}
                                        · biggest gap: {sc.ai.gap}
                                      </span>
                                    )}
                                    {sc.ai.pitch && (
                                      <div className="mt-0.5 italic text-muted-foreground">
                                        “{sc.ai.pitch}”
                                      </div>
                                    )}
                                    {(sc.ai.teamSize || sc.ai.revenueBand) && (
                                      <div className="mt-1 text-muted-foreground">
                                        Estimated: team {sc.ai.teamSize || "?"} · revenue{" "}
                                        {sc.ai.revenueBand || "?"}
                                        {sc.ai.locations
                                          ? ` · ${sc.ai.locations} location${sc.ai.locations === 1 ? "" : "s"}`
                                          : ""}
                                        {sc.ai.sizeConfidence
                                          ? ` (${sc.ai.sizeConfidence} confidence)`
                                          : ""}
                                      </div>
                                    )}
                                    {hiddenReason(p) && (
                                      <div className="mt-1 text-[oklch(.5_.18_25)]">
                                        Hidden by filters: {hiddenReason(p)}
                                      </div>
                                    )}
                                  </div>
                                )}
                                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                  {sc.why.map((w, i) => (
                                    <li key={i} className="inline-flex items-center gap-1">
                                      <Info className="h-3 w-3" /> {w}
                                    </li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
                <span>
                  Score: can we reach them · is it a real business · is there visible room to
                  improve. Click a score for the reasons.
                </span>
                <button
                  onClick={clearAllResults}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear list
                </button>
              </div>
            </Panel>
          ) : (
            !scrapeBusy && (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-8 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">
                  <Search className="h-6 w-6" />
                </div>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Type a city and a kind of business, then <strong>Find businesses</strong>. Each
                  result is read from its own website and scored so the best leads sit at the top.
                </p>
              </div>
            )
          )}
          {scrapeBusy && results.length === 0 && (
            <div className="flex min-h-[280px] items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {aiProgress.total
                ? `Reading websites ${aiProgress.done}/${aiProgress.total}`
                : "Asking Google Maps and OpenStreetMap…"}
            </div>
          )}
        </div>

        {/* Rail */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-border bg-secondary">
            {geo ? (
              <>
                <iframe
                  title="map"
                  src={mapSrc}
                  className="h-[200px] w-full border-0"
                  loading="lazy"
                />
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate">{geo.displayName}</span>
                </div>
              </>
            ) : (
              <div className="flex h-[200px] flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
                <MapPin className="h-6 w-6 opacity-40" />
                The area you search appears here.
              </div>
            )}
          </div>

          <Panel>
            <div className="mb-2 text-xs font-semibold text-muted-foreground">This list</div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Found</dt>
              <dd className="text-right font-semibold tabular-nums">{results.length}</dd>
              <dt className="text-muted-foreground">With email</dt>
              <dd className="text-right font-semibold tabular-nums">{withEmail}</dd>
              <dt className="text-muted-foreground">Selected</dt>
              <dd className="text-right font-semibold tabular-nums">{selectedPeople.length}</dd>
              {Object.entries(sourceTotals).map(([k, v]) => (
                <Fragment key={k}>
                  <dt className="text-muted-foreground">
                    {k === "claude"
                      ? "Websites read"
                      : k === "google"
                        ? "From Google Maps"
                        : k === "osm"
                          ? "From OpenStreetMap"
                          : k}
                  </dt>
                  <dd className="text-right tabular-nums">{v}</dd>
                </Fragment>
              ))}
            </dl>
          </Panel>

          <Panel>
            <button
              onClick={() => setRulesOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="text-xs font-semibold text-muted-foreground">Team rules</span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${rulesOpen ? "rotate-180" : ""}`}
              />
            </button>
            {rulesOpen && (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-foreground">
                <li>One person per company — the highest rank only.</li>
                <li>No 500+ scrapes for now.</li>
                <li>Only businesses doing $100k+ for now.</li>
              </ul>
            )}
          </Panel>

          <Panel>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-muted-foreground">Deny memory</div>
                <div className="text-sm">{history.length} never shown again</div>
              </div>
              <Btn variant="ghost" onClick={() => setShowHistory((v) => !v)}>
                {showHistory ? "Hide" : "Show"}
              </Btn>
            </div>
            {showHistory && (
              <div className="mt-3 space-y-2">
                <input
                  className={inputCls}
                  placeholder="Search…"
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                />
                <div className="max-h-72 space-y-1 overflow-auto">
                  {history
                    .filter((h) => {
                      if (!historyFilter.trim()) return true;
                      const q = historyFilter.toLowerCase();
                      const e = h.entry;
                      return (
                        e.name.toLowerCase().includes(q) ||
                        e.company.toLowerCase().includes(q) ||
                        (e.email ?? "").toLowerCase().includes(q) ||
                        (e.domain ?? "").toLowerCase().includes(q)
                      );
                    })
                    .slice(0, 200)
                    .map(({ key, entry }) => (
                      <div
                        key={key}
                        className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                      >
                        <span
                          className={`shrink-0 rounded px-1.5 py-px text-[.6rem] font-bold uppercase ${
                            entry.reason === "accepted"
                              ? "bg-[oklch(.7_.18_150)]/15 text-[oklch(.45_.15_150)]"
                              : "bg-[oklch(.7_.16_25)]/15 text-[oklch(.5_.18_25)]"
                          }`}
                        >
                          {entry.reason}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-semibold">
                            {entry.company || entry.name || "—"}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            {entry.email || entry.domain || ""}
                          </span>
                        </span>
                        <button
                          onClick={() => update((prev) => restoreFromDenylist(prev, key))}
                          className="shrink-0 text-primary hover:underline"
                        >
                          restore
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <SavedSearchesPanel refreshKey={savedRefresh} />

      {showSave && (
        <SaveSearchModal
          filters={filters}
          geo={geo}
          sources={sources}
          onClose={() => setShowSave(false)}
          onSaved={() => {
            setShowSave(false);
            setSavedRefresh((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
