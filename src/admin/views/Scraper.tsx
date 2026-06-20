import { useState } from "react";
import {
  Radar,
  MapPin,
  Search,
  Loader2,
  Lock,
  Linkedin,
  Globe,
  Phone,
  Mail,
  ArrowRightCircle,
  CheckSquare,
  Square,
  Building2,
} from "lucide-react";
import {
  type AdminData,
  type RawBusiness,
  type ScrapeFilters,
  type ScrapedPerson,
  type GeocodeResult,
  SENIORITIES,
  apolloSearch,
  geocodeLocation,
  uid,
} from "../store";
import { Panel, Field, inputCls, Btn } from "../ui";

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
    perPage: 10,
  });
  const [geo, setGeo] = useState<GeocodeResult | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [scrapeBusy, setScrapeBusy] = useState(false);
  const [results, setResults] = useState<ScrapedPerson[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [banner, setBanner] = useState<{ live: boolean; text: string } | null>(null);
  const [pushed, setPushed] = useState(0);

  function toggleSeniority(id: string) {
    setFilters((f) => ({
      ...f,
      seniorities: f.seniorities.includes(id)
        ? f.seniorities.filter((s) => s !== id)
        : [...f.seniorities, id],
    }));
  }

  async function locate() {
    if (!filters.location.trim()) return;
    setGeoBusy(true);
    const g = await geocodeLocation(filters.location);
    setGeo(g);
    setGeoBusy(false);
  }

  async function runScrape() {
    if (!filters.location.trim()) return;
    setScrapeBusy(true);
    setBanner(null);
    setPushed(0);
    // kick off geocode in parallel if we don't have it yet
    if (!geo) locate();
    const res = await apolloSearch(filters);
    setResults(res.people);
    setSelected(Object.fromEntries(res.people.map((p) => [p.id, true])));
    setBanner({ live: res.live, text: res.message });
    setScrapeBusy(false);
  }

  const selectedPeople = results.filter((p) => selected[p.id]);

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
      source: "Apollo",
    }));
    update((prev) => ({ ...prev, raw: [...rows, ...prev.raw] }));
    setPushed(rows.length);
  }

  // OpenStreetMap embed (no key needed): bbox + marker
  const mapSrc = geo
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${geo.bbox[2]}%2C${geo.bbox[0]}%2C${geo.bbox[3]}%2C${geo.bbox[1]}&layer=mapnik&marker=${geo.lat}%2C${geo.lng}`
    : "";

  return (
    <div className="space-y-6">
      {/* intro */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Enter a city, region or address. Inspirova locates it on the map and pulls the
          decision-makers (owners, C-suite, directors) at businesses there — names, titles,
          company, website, email and LinkedIn — straight from Apollo.io. Accept the good ones into
          your raw-data queue.
        </p>
      </div>

      {/* Filter panel */}
      <Panel>
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-3">
            <Field label="Location / address">
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  value={filters.location}
                  onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && locate()}
                  placeholder="e.g. Antwerp, Belgium  ·  or  Meir 88, Antwerpen"
                />
                <Btn variant="ghost" onClick={locate}>
                  {geoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                  Locate
                </Btn>
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Job titles (optional, comma-separated)">
                <input
                  className={inputCls}
                  value={filters.titles}
                  onChange={(e) => setFilters({ ...filters, titles: e.target.value })}
                  placeholder="CEO, Owner, Marketing Manager"
                />
              </Field>
              <Field label="Industry / keyword (optional)">
                <input
                  className={inputCls}
                  value={filters.industry}
                  onChange={(e) => setFilters({ ...filters, industry: e.target.value })}
                  placeholder="Real estate, hospitality…"
                />
              </Field>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                Seniority (high ranks)
              </span>
              <div className="flex flex-wrap gap-2">
                {SENIORITIES.map((s) => {
                  const on = filters.seniorities.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSeniority(s.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        on
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3 pt-1">
              <Field label="Results to pull">
                <select
                  className={inputCls + " w-28"}
                  value={filters.perPage}
                  onChange={(e) => setFilters({ ...filters, perPage: Number(e.target.value) })}
                >
                  {[5, 10, 15, 25].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
              <Btn onClick={runScrape} className="px-5">
                {scrapeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
                {scrapeBusy ? "Scraping…" : "Scrape leads"}
              </Btn>
            </div>
          </div>

          {/* Map */}
          <div className="min-h-[260px] overflow-hidden rounded-xl border border-border bg-secondary">
            {geo ? (
              <div className="flex h-full flex-col">
                <iframe
                  title="map"
                  src={mapSrc}
                  className="h-[230px] w-full border-0"
                  loading="lazy"
                />
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate">{geo.displayName}</span>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                <MapPin className="h-7 w-7 opacity-40" />
                Enter a location and hit <strong>Locate</strong> to drop it on the map.
              </div>
            )}
          </div>
        </div>
      </Panel>

      {/* Banner */}
      {banner && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            banner.live
              ? "border-[color-mix(in oklab, var(--brand-violet) 40%, transparent)] bg-[color-mix(in oklab, var(--brand-violet) 10%, transparent)] text-[var(--brand-violet)]"
              : "border-[oklch(.7_.16_60/.4)] bg-[oklch(.8_.16_80/.1)] text-[oklch(.45_.1_70)]"
          }`}
        >
          <span
            className={`rounded-full px-2 py-0.5 text-[.65rem] font-bold uppercase tracking-wider ${
              banner.live ? "bg-[var(--brand-violet)] text-white" : "bg-[oklch(.75_.16_70)] text-white"
            }`}
          >
            {banner.live ? "Live" : "Demo"}
          </span>
          {banner.text}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <Panel>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="font-display text-lg font-bold">{results.length} contacts found</h3>
              <span className="text-sm text-muted-foreground">· {selectedPeople.length} selected</span>
            </div>
            <div className="flex items-center gap-2">
              <Btn
                variant="ghost"
                onClick={() =>
                  setSelected(
                    selectedPeople.length === results.length
                      ? {}
                      : Object.fromEntries(results.map((p) => [p.id, true])),
                  )
                }
              >
                {selectedPeople.length === results.length ? "Clear all" : "Select all"}
              </Btn>
              <Btn onClick={sendToRaw}>
                <ArrowRightCircle className="h-4 w-4" /> Send {selectedPeople.length} to Raw Data
              </Btn>
            </div>
          </div>

          {pushed > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-secondary px-3 py-2.5 text-sm">
              <CheckSquare className="h-4 w-4 text-[var(--brand-violet)]" />
              Added {pushed} contact(s) to your raw-data queue.
              <button onClick={() => go("raw")} className="font-semibold text-primary underline-offset-2 hover:underline">
                Open Raw Data →
              </button>
            </div>
          )}

          <div className="space-y-2">
            {results.map((p) => {
              const on = !!selected[p.id];
              return (
                <div
                  key={p.id}
                  className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                    on ? "border-primary/40 bg-primary/[.04]" : "border-border bg-background"
                  }`}
                >
                  <button
                    onClick={() => setSelected((s) => ({ ...s, [p.id]: !on }))}
                    className="shrink-0 text-primary"
                    aria-label="select"
                  >
                    {on ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-muted-foreground" />}
                  </button>

                  <div className="min-w-[180px] flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{p.name}</span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[.62rem] font-bold uppercase tracking-wider text-muted-foreground">
                        {p.seniority.replace("_", " ")}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{p.title}</div>
                  </div>

                  <div className="min-w-[150px] flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {p.company}
                    </div>
                    <a
                      href={`https://${p.website}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Globe className="h-3 w-3" /> {p.website}
                    </a>
                  </div>

                  <div className="min-w-[200px] flex-1 space-y-0.5 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      {p.emailLocked ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Lock className="h-3 w-3" /> locked — enrich to reveal
                        </span>
                      ) : (
                        <span className="truncate">{p.email}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" /> {p.phone || "—"}
                    </div>
                  </div>

                  {p.linkedin && (
                    <a
                      href={p.linkedin}
                      target="_blank"
                      rel="noreferrer"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-[#0a66c2] hover:bg-secondary"
                      aria-label="LinkedIn"
                    >
                      <Linkedin className="h-4 w-4" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {results.length === 0 && !scrapeBusy && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">
            <Search className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground">
            No results yet. Set a location and seniority, then hit <strong>Scrape leads</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
