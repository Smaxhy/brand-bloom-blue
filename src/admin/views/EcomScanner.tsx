import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CircleAlert,
  ExternalLink,
  Instagram,
  Loader2,
  Mail,
  Save,
  Search,
  ShoppingBag,
  SquareStop,
  X,
} from "lucide-react";
import { followersLabel, igHandle } from "@/lib/instagram";
import {
  ECOM_MARKETS,
  ECOM_NICHES,
  type EcomBrand,
  type EcomSource,
  mergeEcomBrands,
  resolveNiche,
} from "@/lib/ecom-brands";
import { type AdminData, uid } from "../store";
import { addToRaw } from "../raw-merge";
import {
  ECOM_FILTERS,
  ECOM_LIST_MAX,
  ECOM_SEARCH_CHOICES,
  ECOM_SORTS,
  type EcomFilter,
  ecomCounts,
  ecomIsSaved,
  ecomNiches,
  ecomSavedKeys,
  ecomToRaw,
  ecomStartAt,
  ecomVisible,
} from "../ecom-board";
import { useEcomScan } from "../ecom-finder";
import { Button } from "@/components/ui/button";
import { Btn, Field, Panel, inputCls } from "../ui";

type Go = (view: "instagram" | "raw" | "settings") => void;

const pill = (on: boolean) =>
  `h-9 rounded-full border px-3 py-1.5 text-xs font-semibold sm:h-8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    on
      ? "border-transparent bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
      : "border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground"
  }`;
const smallBtn =
  "inline-flex h-auto min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 [&_svg]:size-3.5";
const tone = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
  soft: "bg-secondary text-foreground hover:bg-secondary/70 hover:text-foreground",
  bad: "bg-transparent text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
};
const selectCls = "min-h-10 rounded-lg border border-border bg-background px-2.5 text-sm";

function FitChip({ brand }: { brand: EcomBrand }) {
  return (
    <span
      title={brand.why.length ? brand.why.join(" · ") : "How ready this brand is to contact"}
      className={`inline-grid h-6 min-w-6 place-items-center rounded-md px-1 text-[.68rem] font-bold tabular-nums ${
        brand.score >= 70
          ? "bg-success/15 text-success-foreground"
          : brand.score >= 45
            ? "bg-warning/20 text-warning-foreground"
            : "bg-secondary text-muted-foreground"
      }`}
    >
      {brand.score}
    </span>
  );
}

/** What we know about the shop itself, in a word. */
function kindLabel(b: EcomBrand): { text: string; warn: boolean; hint: string } | null {
  if (b.kind === "shop")
    return b.platform
      ? { text: b.platform, warn: false, hint: `The shop runs on ${b.platform}` }
      : { text: "Sells online", warn: false, hint: "The site has a cart and prices of its own" };
  if (b.kind === "unread")
    return {
      text: "Site not opened",
      warn: true,
      hint: "The site did not let itself be read, so the shop, its email and its Instagram are unconfirmed. Have a look before you save it.",
    };
  return b.website
    ? {
        text: "Shop not confirmed",
        warn: true,
        hint: "Their Instagram names this site, but it could not be confirmed as a shop",
      }
    : {
        text: "Instagram only",
        warn: false,
        hint: "Found by its Instagram page. No shop address is known yet.",
      };
}

export function EcomScanner({
  data,
  update,
  go,
}: {
  data: AdminData;
  update: (fn: (p: AdminData) => AdminData) => void;
  go: Go;
}) {
  const [niche, setNiche] = useState("");
  const [market, setMarket] = useState("");
  const [sources, setSources] = useState<Record<EcomSource, boolean>>({
    stores: true,
    instagram: true,
  });
  const [maxSearches, setMaxSearches] = useState<number>(20);
  const [onlyNew, setOnlyNew] = useState(true);
  const [filter, setFilter] = useState<EcomFilter>("all");
  const [q, setQ] = useState("");
  const [nicheFilter, setNicheFilter] = useState("");
  const [sortValue, setSortValue] = useState(ECOM_SORTS[0].value);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(100);
  const scan = useEcomScan(update);

  const brands = useMemo(() => data.ecom?.brands ?? [], [data.ecom]);
  const counts = useMemo(() => ecomCounts(brands), [brands]);
  const niches = useMemo(() => ecomNiches(brands), [brands]);
  const saved = useMemo(() => ecomSavedKeys(data.raw), [data.raw]);
  const sort = ECOM_SORTS.find((s) => s.value === sortValue)?.sort ?? ECOM_SORTS[0].sort;
  const visible = useMemo(
    () => ecomVisible(brands, { filter, q, niche: niches.length > 1 ? nicheFilter : "", sort }),
    [brands, filter, q, nicheFilter, niches.length, sort],
  );
  const page = visible.slice(0, shown);
  const picks = visible.filter((b) => selected.has(b.key));
  const allPicked = visible.length > 0 && picks.length === visible.length;

  // A new filter starts from the top with nothing ticked.
  useEffect(() => {
    setSelected(new Set());
    setShown(100);
  }, [filter, q, nicheFilter]);

  const chosen = resolveNiche(niche);
  const picked = (Object.keys(sources) as EcomSource[]).filter((s) => sources[s]);
  const canScan = !!chosen && picked.length > 0 && !scan.busy;
  // With "Only new", a niche that was scanned before is picked up after the searches that already ran.
  const { startAt, continuing } = useMemo(
    () => ecomStartAt(data.ecom?.cursors, { niche, market, sources: picked, onlyNew }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.ecom?.cursors, niche, market, sources, onlyNew],
  );

  function start() {
    if (!canScan) return;
    void scan.run(
      { niche, market, sources: picked, maxSearches, hideSeen: onlyNew, startAt },
      brands,
    );
  }

  /** Save brands to Raw Data and take them off this list. Nothing is sent to anyone. */
  function save(list: EcomBrand[]) {
    if (!list.length) return;
    const rows = list.map((b) => ecomToRaw(b, uid("r")));
    const keys = new Set(list.map((b) => b.key));
    const preview = addToRaw(data.raw, rows);
    const rawBefore = data.raw;
    update((prev) => ({
      ...prev,
      raw: addToRaw(prev.raw, rows).raw,
      ecom: prev.ecom
        ? {
            ...prev.ecom,
            brands: prev.ecom.brands.filter((b) => !keys.has(b.key)),
            updatedAt: Date.now(),
          }
        : prev.ecom,
    }));
    setSelected(new Set());
    const withIg = list.filter((b) => b.instagram).length;
    const withEmail = list.filter((b) => b.email).length;
    const what =
      list.length === 1
        ? `${list[0].name} saved to Raw Data`
        : `${list.length} brands saved to Raw Data${preview.updated ? ` (${preview.updated} were there already)` : ""}`;
    const where = [
      withIg ? `${withIg} in Instagram DMs` : "",
      withEmail ? `${withEmail} with an email` : "",
    ].filter(Boolean);
    // Undo puts Raw Data back as it was and the brands back in the list (a scan may have added more since).
    const undo = {
      label: "Undo",
      onClick: () =>
        update((prev) => ({
          ...prev,
          raw: rawBefore,
          ecom: {
            ...prev.ecom,
            brands: mergeEcomBrands(prev.ecom?.brands ?? [], list).brands,
            updatedAt: Date.now(),
          },
        })),
    };
    toast.success(
      `${what}${where.length ? `: ${where.join(", ")}` : ""}.`,
      withIg
        ? { action: { label: "Open Instagram DMs", onClick: () => go("instagram") }, cancel: undo }
        : { action: undo },
    );
  }

  function remove(list: EcomBrand[]) {
    if (!list.length) return;
    const keys = new Set(list.map((b) => b.key));
    update((prev) => ({
      ...prev,
      ecom: prev.ecom
        ? {
            ...prev.ecom,
            brands: prev.ecom.brands.filter((b) => !keys.has(b.key)),
            updatedAt: Date.now(),
          }
        : prev.ecom,
    }));
    setSelected(new Set());
    toast.success(
      list.length === 1
        ? `${list[0].name} removed from the list`
        : `${list.length} brands removed from the list`,
      {
        action: {
          label: "Undo",
          onClick: () =>
            update((prev) => ({
              ...prev,
              ecom: {
                ...prev.ecom,
                brands: mergeEcomBrands(prev.ecom?.brands ?? [], list).brands,
                updatedAt: Date.now(),
              },
            })),
        },
      },
    );
  }

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Plain functions, not components: a component declared here would be rebuilt on every render.
  const brandCell = (b: EcomBrand) => {
    const kind = kindLabel(b);
    return (
      <>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold">{b.name}</span>
          {kind && (
            <span
              title={kind.hint}
              className={`rounded-md px-1.5 py-0.5 text-[.68rem] font-semibold ${
                kind.warn
                  ? "bg-warning/20 text-warning-foreground"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {kind.text}
            </span>
          )}
          {ecomIsSaved(b, saved) && (
            <span
              title="This shop or its Instagram is already in Raw Data. Saving it again only adds what is missing there."
              className="rounded-md bg-secondary px-1.5 py-0.5 text-[.68rem] font-semibold text-muted-foreground"
            >
              Already saved
            </span>
          )}
        </div>
        {b.website && (
          <a
            href={`https://${b.website}`}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
            title={`Open ${b.website}`}
          >
            <span className="truncate">{b.website}</span>
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
          </a>
        )}
        {b.about && (
          <span
            className="mt-0.5 block text-xs text-muted-foreground md:line-clamp-2"
            title={b.about}
          >
            {b.about}
          </span>
        )}
        {b.kind === "shop" && (
          <span
            className="mt-0.5 block text-xs text-muted-foreground"
            title="Marketing tools seen in the shop's pages. A shop without an ad pixel is usually not advertising yet."
          >
            {b.tools.length ? b.tools.join(" · ") : "No ad pixel seen"}
            {b.currency ? ` · sells in ${b.currency}` : ""}
          </span>
        )}
      </>
    );
  };

  const instagramCell = (b: EcomBrand) => {
    const handle = igHandle(b.instagram);
    if (!handle) return <span className="text-muted-foreground/60">–</span>;
    return (
      <>
        <a
          href={b.instagram}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 font-semibold text-primary hover:underline"
          title={`Open @${handle} on Instagram`}
        >
          <Instagram className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">@{handle}</span>
        </a>
        {b.followers != null && (
          <span className="block text-xs tabular-nums text-muted-foreground">
            {followersLabel(b.followers)} followers
          </span>
        )}
        {!b.instagramSure && (
          <span
            className="mt-0.5 flex items-start gap-1 text-xs text-warning-foreground"
            title={b.instagramWhy}
          >
            <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            <span>Check it is theirs</span>
          </span>
        )}
      </>
    );
  };

  const emailCell = (b: EcomBrand) =>
    b.email ? (
      <span className="inline-flex max-w-full items-center gap-1.5" title={b.email}>
        <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{b.email}</span>
      </span>
    ) : (
      <span className="text-muted-foreground/60">–</span>
    );

  const actions = (b: EcomBrand) => (
    <div className="flex items-center gap-1.5 md:justify-end">
      <Button
        variant="ghost"
        type="button"
        className={`${smallBtn} ${tone.primary}`}
        onClick={() => save([b])}
        title="Save to Raw Data. With an Instagram it also appears in Instagram DMs; with an email it can be added to outreach."
      >
        <Save className="h-3.5 w-3.5" aria-hidden="true" /> Save
      </Button>
      <Button
        variant="ghost"
        type="button"
        className={`${smallBtn} ${tone.bad}`}
        onClick={() => remove([b])}
        aria-label={`Remove ${b.name} from the list`}
        title="Not a fit: take it off the list"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  );

  const p = scan.progress;
  const outcome = scan.outcome;
  const emptyText = "No brand in the list matches this.";

  return (
    <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Finds online brands in a niche, with their shop, their Instagram and their email where the
        shop gives one. <strong className="text-foreground">Save</strong> puts a brand in Raw Data:
        from there it shows up in Instagram DMs and can be added to outreach. Nothing is sent from
        here.
      </p>

      <Panel>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            start();
          }}
        >
          <div>
            <label htmlFor="ecom-niche" className="mb-1.5 block text-sm font-semibold">
              What do the brands sell?
            </label>
            <input
              id="ecom-niche"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="anime, handmade soap, cat furniture…"
              maxLength={160}
              disabled={scan.busy}
              autoComplete="off"
              className={`${inputCls} sm:max-w-xl`}
            />
            <div
              className="mt-2.5 flex flex-wrap gap-1.5"
              role="group"
              aria-label="Niches to pick from"
            >
              {ECOM_NICHES.map((n) => (
                <Button
                  variant="ghost"
                  key={n.id}
                  type="button"
                  disabled={scan.busy}
                  aria-pressed={chosen?.id === n.id}
                  onClick={() => setNiche(n.label)}
                  className={pill(chosen?.id === n.id)}
                >
                  {n.label}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Pick one, or type anything of your own. Several at once with commas: cat furniture,
              cat trees.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,13rem)_minmax(0,13rem)_minmax(0,1fr)]">
            <Field label="Country">
              <select
                value={market}
                onChange={(e) => setMarket(e.target.value)}
                disabled={scan.busy}
                className={`${selectCls} w-full`}
              >
                {ECOM_MARKETS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Searches to use at most">
              <select
                value={maxSearches}
                onChange={(e) => setMaxSearches(Number(e.target.value))}
                disabled={scan.busy}
                className={`${selectCls} w-full`}
              >
                {ECOM_SEARCH_CHOICES.map((n) => (
                  <option key={n} value={n}>
                    {n} searches
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2 lg:col-span-1">
              <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                Where to look
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="ghost"
                  type="button"
                  disabled={scan.busy}
                  aria-pressed={sources.stores}
                  onClick={() => setSources((s) => ({ ...s, stores: !s.stores }))}
                  className={pill(sources.stores)}
                  title="Searches the web for shops, then opens each one (free) to read its shop software, its email and its Instagram"
                >
                  Online shops
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  disabled={scan.busy}
                  aria-pressed={sources.instagram}
                  onClick={() => setSources((s) => ({ ...s, instagram: !s.instagram }))}
                  className={pill(sources.instagram)}
                  title="Searches Instagram for brand pages: gives the account and its follower count. Fan pages, creators and accounts over a million followers are left out."
                >
                  Instagram
                </Button>
                <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
                <Button
                  variant="ghost"
                  type="button"
                  disabled={scan.busy}
                  aria-pressed={onlyNew}
                  onClick={() => setOnlyNew((v) => !v)}
                  className={pill(onlyNew)}
                  title="Leave out brands an earlier scan already returned, so searches are not spent on them twice"
                >
                  Only new
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border pt-4">
            {scan.busy && p ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3" role="status">
                <Loader2
                  className="h-4 w-4 shrink-0 animate-spin text-primary"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 basis-60">
                  <div className="text-sm font-semibold tabular-nums">
                    {p.searches < p.max
                      ? `Search ${p.searches + 1} of ${p.max}`
                      : `${p.max} searches used`}{" "}
                    · {p.found} new {p.found === 1 ? "brand" : "brands"}
                  </div>
                  <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500"
                      style={{ width: `${Math.round((p.searches / Math.max(1, p.max)) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground" title={p.query}>
                    {p.query ? `Last search: ${p.query}` : "Starting the first search…"}
                  </div>
                </div>
                <Btn variant="ghost" onClick={scan.stop} disabled={scan.stopping}>
                  <SquareStop className="h-4 w-4" /> {scan.stopping ? "Stopping…" : "Stop"}
                </Btn>
              </div>
            ) : (
              <>
                <Btn type="submit" disabled={!canScan}>
                  <Search className="h-4 w-4" /> Find brands
                </Btn>
                <p className="min-w-0 flex-1 basis-60 text-xs text-muted-foreground">
                  {!chosen
                    ? "Pick a niche or type one to start."
                    : !picked.length
                      ? "Choose where to look: online shops, Instagram, or both."
                      : `Uses ${maxSearches} searches of your search provider at most, one credit each, and stops early when they find nothing new. Opening the shops to read them is free.${continuing ? " Carries on with the searches the last scan of this niche did not get to." : ""}`}
                </p>
              </>
            )}
          </div>
        </form>

        {outcome?.end === "noProvider" && (
          <div
            className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-warning/15 p-3 text-sm text-warning-foreground"
            role="alert"
          >
            <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 basis-60">
              No search key is connected. The scanner needs a Serper or a Brave Search key to look
              for brands: add one in Settings, then scan again.
            </span>
            <Btn variant="ghost" onClick={() => go("settings")}>
              Open Settings
            </Btn>
          </div>
        )}
        {outcome && outcome.end !== "noProvider" && outcome.message && (
          <p
            className={`mt-4 text-sm ${outcome.end === "failed" || outcome.end === "noSearches" ? "text-warning-foreground" : "text-muted-foreground"}`}
            role="status"
          >
            {outcome.message}
          </p>
        )}
        {outcome && outcome.warnings.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {outcome.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </Panel>

      {brands.length === 0 ? (
        <Panel className="!py-12 text-center">
          <ShoppingBag
            className="mx-auto mb-3 h-7 w-7 text-muted-foreground/60"
            aria-hidden="true"
          />
          <p className="font-semibold">
            {scan.busy ? "Looking for brands…" : "No brands in the list yet"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {scan.busy
              ? "They appear here as each search comes back, the best to contact first."
              : "Say what they sell above and press Find brands. Each brand comes with its shop, its Instagram and its email where the shop gives one."}
          </p>
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div
              role="tablist"
              aria-label="Which brands to show"
              className="flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-card p-1"
            >
              {ECOM_FILTERS.map((f) => (
                <Button
                  variant="ghost"
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  title={f.hint}
                  onClick={() => setFilter(f.id)}
                  className={`inline-flex h-auto min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    filter === f.id
                      ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {f.label}
                  <span
                    className={`rounded-full px-1.5 text-xs tabular-nums ${
                      filter === f.id
                        ? "bg-primary-foreground/20"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {counts[f.id]}
                  </span>
                </Button>
              ))}
            </div>
            {brands.length >= ECOM_LIST_MAX && (
              <p className="text-xs text-warning-foreground">
                The list is full ({ECOM_LIST_MAX} brands). Save or remove some: a new scan drops the
                oldest first.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-56 sm:max-w-xs">
              <Search
                className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search brand, site or account"
                aria-label="Search the list"
                className={`${inputCls} pl-8`}
              />
            </div>
            {niches.length > 1 && (
              <select
                value={nicheFilter}
                onChange={(e) => setNicheFilter(e.target.value)}
                aria-label="Niche"
                className={selectCls}
              >
                <option value="">All niches</option>
                {niches.map((n) => (
                  <option key={n.niche} value={n.niche}>
                    {n.niche} ({n.n})
                  </option>
                ))}
              </select>
            )}
            <select
              value={sortValue}
              onChange={(e) => setSortValue(e.target.value)}
              aria-label="Sort"
              className={selectCls}
            >
              {ECOM_SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              {visible.length} {visible.length === 1 ? "brand" : "brands"}
            </span>
          </div>

          {visible.length > 0 && (
            <div className="flex min-h-9 flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allPicked}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(visible.map((b) => b.key)) : new Set())
                  }
                  className="h-4 w-4 rounded border-border"
                />
                <span className="text-muted-foreground">
                  {picks.length ? `${picks.length} selected` : `Select all ${visible.length}`}
                </span>
              </label>
              {picks.length > 0 && (
                <>
                  <Button
                    variant="ghost"
                    type="button"
                    className={`${smallBtn} ${tone.primary}`}
                    onClick={() => save(picks)}
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden="true" /> Save {picks.length} to Raw
                    Data
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    className={`${smallBtn} ${tone.soft}`}
                    onClick={() => remove(picks)}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" /> Remove from the list
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Computer: a table */}
          <Panel className="hidden overflow-x-auto !p-0 md:block">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 px-2 py-3" />
                  <th className="px-3 py-3 font-semibold">Brand</th>
                  <th className="px-3 py-3 font-semibold">Instagram</th>
                  <th className="px-3 py-3 font-semibold">Email</th>
                  <th className="px-3 py-3 text-right font-semibold">Fit</th>
                  <th className="px-3 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {page.map((b) => (
                  <tr
                    key={b.key}
                    className="border-b border-border align-top last:border-0 hover:bg-secondary/40"
                  >
                    <td className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Select ${b.name}`}
                        checked={selected.has(b.key)}
                        onChange={() => toggle(b.key)}
                        className="h-4 w-4 rounded border-border"
                      />
                    </td>
                    <td className="max-w-[340px] px-3 py-3">{brandCell(b)}</td>
                    <td className="max-w-[210px] px-3 py-3">{instagramCell(b)}</td>
                    <td className="max-w-[230px] px-3 py-3">{emailCell(b)}</td>
                    <td className="px-3 py-3 text-right">
                      <FitChip brand={b} />
                    </td>
                    <td className="px-3 py-3">{actions(b)}</td>
                  </tr>
                ))}
                {page.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-sm text-muted-foreground"
                    >
                      {emptyText}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>

          {/* Phone: one card per brand, with buttons big enough to tap */}
          <div className="space-y-3 md:hidden">
            {page.map((b) => (
              <Panel key={b.key} className="!p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${b.name}`}
                    checked={selected.has(b.key)}
                    onChange={() => toggle(b.key)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-border"
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">{brandCell(b)}</div>
                      <FitChip brand={b} />
                    </div>
                    {(b.instagram || b.email) && (
                      <div className="mt-2.5 space-y-1.5">
                        {b.instagram && <div>{instagramCell(b)}</div>}
                        {b.email && <div>{emailCell(b)}</div>}
                      </div>
                    )}
                    <div className="mt-3">{actions(b)}</div>
                  </div>
                </div>
              </Panel>
            ))}
            {page.length === 0 && (
              <Panel className="text-center text-sm text-muted-foreground">{emptyText}</Panel>
            )}
          </div>

          {visible.length > page.length && (
            <div className="flex justify-center">
              <Btn variant="ghost" onClick={() => setShown((n) => n + 100)}>
                Show {Math.min(100, visible.length - page.length)} more (
                {visible.length - page.length} left)
              </Btn>
            </div>
          )}
        </>
      )}
    </div>
  );
}
