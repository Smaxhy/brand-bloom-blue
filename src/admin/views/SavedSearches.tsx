import { useEffect, useState } from "react";
import {
  Bookmark,
  Play,
  Loader2,
  Trash2,
  Clock,
  CalendarClock,
  Mail,
  CheckCircle2,
} from "lucide-react";
import type { ScrapeFilters, GeocodeResult, ScrapeSource } from "../store";
import {
  type SavedSearch,
  type Sequence,
  listSavedSearches,
  saveSavedSearch,
  deleteSavedSearch,
  runSavedSearchNow,
  listSequences,
} from "../outreach";
import { Panel, Modal, Field, inputCls, Btn } from "../ui";

/* --------------------------------------------------------------- helpers */

function ago(iso: string | null): string {
  if (!iso) return "never";
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.round(d / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
function until(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime() - Date.now();
  if (d <= 60000) return "due now";
  const h = Math.round(d / 3600000);
  if (h < 1) return `in ${Math.round(d / 60000)} min`;
  if (h < 36) return `in ${h} h`;
  return `in ${Math.round(h / 24)} d`;
}

/* ---------------------------------------------------------- save modal */

export function SaveSearchModal({
  filters,
  geo,
  sources,
  onClose,
  onSaved,
}: {
  filters: ScrapeFilters;
  geo: GeocodeResult | null;
  sources: Record<ScrapeSource, boolean>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(
    `${filters.industry || "Leads"} · ${filters.location}`.slice(0, 80),
  );
  const [schedule, setSchedule] = useState<SavedSearch["schedule"]>("weekly");
  const [minScore, setMinScore] = useState(55);
  const [region, setRegion] = useState<"US" | "EU">(
    /belg|nether|germ|franc|spain|ital|austria|swiss|europe|uk|london|amsterdam|brussel|antwerp|gent|ghent|paris|berlin|madrid|lisbon|dublin/i.test(
      filters.location,
    )
      ? "EU"
      : "US",
  );
  const [seqId, setSeqId] = useState<string>("");
  const [seqs, setSeqs] = useState<Sequence[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listSequences()
      .then((s) => setSeqs(s.filter((x) => x.status === "active")))
      .catch(() => setSeqs([]));
  }, []);

  const providers = (["google", "osm", "apify"] as ScrapeSource[])
    .filter((k) => sources[k])
    .flatMap((k) => (k === "google" ? ["places", "serper"] : k === "osm" ? ["osm"] : ["apify"]));

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await saveSavedSearch({
        name: name.trim(),
        location: filters.location,
        industry: filters.industry,
        per_page: filters.perPage,
        providers: providers.length ? providers : ["places", "serper", "osm"],
        geo: geo ? { lat: geo.lat, lng: geo.lng, bbox: geo.bbox } : null,
        region,
        min_score: minScore,
        filters: {
          radiusKm: filters.radiusKm || undefined,
          minRating: filters.minRating || undefined,
          minReviews: filters.minReviews || undefined,
          maxReviews: filters.maxReviews || undefined,
          seniorities: filters.seniorities?.length ? filters.seniorities : undefined,
          teamSizes: filters.teamSizes?.length ? filters.teamSizes : undefined,
          revenueBands: filters.revenueBands?.length ? filters.revenueBands : undefined,
        },
        auto_enroll_sequence_id: seqId || null,
        schedule,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Save this search">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          A saved search re-runs itself on the schedule you pick, only ever looks at businesses it
          hasn't seen before, scores each one, and can drop the good ones straight into a sequence.
        </p>
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-secondary px-3 py-2">
            <div className="text-[.65rem] font-bold uppercase tracking-wider text-muted-foreground">
              Location
            </div>
            <div className="truncate font-medium">{filters.location}</div>
          </div>
          <div className="rounded-lg bg-secondary px-3 py-2">
            <div className="text-[.65rem] font-bold uppercase tracking-wider text-muted-foreground">
              Industry
            </div>
            <div className="truncate font-medium">{filters.industry || "any"}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Runs">
            <select
              className={inputCls}
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as SavedSearch["schedule"])}
            >
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="off">Only when I click Run</option>
            </select>
          </Field>
          <Field label="Region (email footer rules)">
            <select
              className={inputCls}
              value={region}
              onChange={(e) => setRegion(e.target.value as "US" | "EU")}
            >
              <option value="US">US (CAN-SPAM)</option>
              <option value="EU">EU (GDPR)</option>
            </select>
          </Field>
        </div>
        {(() => {
          const parts: string[] = [];
          if (filters.radiusKm) parts.push(`within ${filters.radiusKm} km`);
          if (filters.minRating) parts.push(`${filters.minRating}★+`);
          if (filters.minReviews) parts.push(`${filters.minReviews}+ reviews`);
          if (filters.maxReviews) parts.push(`under ${filters.maxReviews} reviews`);
          if (filters.seniorities?.length) parts.push(`title: ${filters.seniorities.join("/")}`);
          if (filters.teamSizes?.length) parts.push(`team ${filters.teamSizes.join(", ")}`);
          if (filters.revenueBands?.length)
            parts.push(`revenue ${filters.revenueBands.join(", ")}`);
          return parts.length ? (
            <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
              Filters saved with this search: {parts.join(" · ")}
            </p>
          ) : null;
        })()}
        <Field label={`Auto-enrol leads scoring at least ${minScore}`}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-full accent-[var(--brand-violet)]"
          />
          <div className="mt-1 flex justify-between text-[.65rem] text-muted-foreground">
            <span>everyone with an email</span>
            <span>only the best</span>
          </div>
        </Field>
        <Field label="Into sequence">
          <select className={inputCls} value={seqId} onChange={(e) => setSeqId(e.target.value)}>
            <option value="">Don't enrol — just add to Leads</option>
            {seqs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        {!seqs.length && (
          <p className="text-xs text-muted-foreground">
            No active sequences yet — activate one under Outreach → Sequences to auto-enrol.
          </p>
        )}
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={save} disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}{" "}
            Save search
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- panel */

export function SavedSearchesPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [rows, setRows] = useState<SavedSearch[]>([]);
  const [seqNames, setSeqNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [ss, seqs] = await Promise.all([
        listSavedSearches(),
        listSequences().catch(() => [] as Sequence[]),
      ]);
      setRows(ss);
      setSeqNames(Object.fromEntries(seqs.map((s) => [s.id, s.name])));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [refreshKey]);

  async function run(id: string) {
    setRunning(id);
    setNotice(null);
    try {
      const r = await runSavedSearchNow(id);
      if (!r.ok) setNotice(r.error || "Run failed");
      else {
        const x = r.result || {};
        setNotice(
          `Done: ${x.found ?? 0} found, ${x.new ?? 0} new, ${x.with_email ?? 0} with email, ${x.enrolled ?? 0} enrolled.`,
        );
      }
      await load();
    } finally {
      setRunning(null);
    }
  }

  async function setSchedule(s: SavedSearch, schedule: SavedSearch["schedule"]) {
    await saveSavedSearch({
      ...s,
      schedule,
      next_run_at: schedule === "off" ? null : new Date().toISOString(),
    });
    await load();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this saved search? Leads it already found stay in Leads.")) return;
    await deleteSavedSearch(id);
    await load();
  }

  if (!loading && !rows.length) return null;

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-bold">Saved searches</h3>
          <p className="text-xs text-muted-foreground">
            Run on the Worker cron. Each run skips everything it has seen before, scores new
            businesses and (if set) enrols the ones above the bar.
          </p>
        </div>
        {notice && <div className="rounded-lg bg-secondary px-3 py-1.5 text-xs">{notice}</div>}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => {
            const r = s.last_result || {};
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2.5"
              >
                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{s.name}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[.6rem] font-bold uppercase tracking-wider text-muted-foreground">
                      {s.region}
                    </span>
                    {s.auto_enroll_sequence_id && (
                      <span className="rounded-full bg-[var(--brand-violet)]/15 px-2 py-0.5 text-[.6rem] font-bold uppercase tracking-wider text-[var(--brand-violet)]">
                        → {seqNames[s.auto_enroll_sequence_id] || "sequence"} · ≥{s.min_score}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {s.location}
                    {s.industry ? ` · ${s.industry}` : ""} · {s.per_page}/run
                  </div>
                </div>
                <div className="grid min-w-[220px] grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="font-display text-base font-bold tabular-nums">
                      {r.new ?? "—"}
                    </div>
                    <div className="text-[.6rem] font-bold uppercase tracking-wider text-muted-foreground">
                      new
                    </div>
                  </div>
                  <div>
                    <div className="font-display text-base font-bold tabular-nums">
                      {r.with_email ?? "—"}
                    </div>
                    <div className="flex items-center justify-center gap-1 text-[.6rem] font-bold uppercase tracking-wider text-muted-foreground">
                      <Mail className="h-3 w-3" /> email
                    </div>
                  </div>
                  <div>
                    <div className="font-display text-base font-bold tabular-nums">
                      {r.enrolled ?? "—"}
                    </div>
                    <div className="flex items-center justify-center gap-1 text-[.6rem] font-bold uppercase tracking-wider text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3" /> enrolled
                    </div>
                  </div>
                </div>
                <div className="min-w-[150px] text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> last {ago(s.last_run_at)}
                  </div>
                  <div className="flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" /> next{" "}
                    {s.schedule === "off" ? "manual" : until(s.next_run_at)}
                  </div>
                </div>
                <select
                  className={inputCls.replace("w-full", "") + " w-28 shrink-0 py-1.5 text-xs"}
                  value={s.schedule}
                  onChange={(e) => setSchedule(s, e.target.value as SavedSearch["schedule"])}
                  aria-label="Schedule"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="off">Manual</option>
                </select>
                <Btn
                  variant="soft"
                  onClick={() => run(s.id)}
                  disabled={running === s.id}
                  title="Run this search now"
                >
                  {running === s.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}{" "}
                  Run
                </Btn>
                <button
                  onClick={() => remove(s.id)}
                  aria-label="Delete saved search"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-secondary"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                {r.errors?.length ? (
                  <div className="w-full text-xs text-destructive">
                    {r.errors.slice(0, 2).join(" · ")}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
