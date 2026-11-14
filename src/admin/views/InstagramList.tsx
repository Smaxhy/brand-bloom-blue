import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowRightCircle,
  ArrowUp,
  BadgeCheck,
  Check,
  ChevronsUpDown,
  CircleAlert,
  Instagram,
  Loader2,
  MessageCircleReply,
  Search,
  Send,
  SquareStop,
  Undo2,
  X,
} from "lucide-react";
import { followersLabel, igDmUrl } from "@/lib/instagram";
import { type AdminData, igDmsToday, logIgDm, uid } from "../store";
import {
  IG_STAGES,
  type IgAccount,
  type IgSort,
  type IgSortKey,
  type IgStage,
  confirmInstagram,
  igAccounts,
  igCounts,
  igDefaultSort,
  igFinderTargets,
  igMatches,
  moveIgAccounts,
  rejectInstagram,
  restoreIgMarks,
  sortIgAccounts,
} from "../ig-board";
import { useInstagramFinder } from "../ig-finder";
import { openInstagramDm } from "../ig-dm";
import { Button } from "@/components/ui/button";
import { Btn, Panel, inputCls } from "../ui";

type Section = Exclude<IgStage, "check">;

const SORTS: { value: string; label: string; sort: IgSort }[] = [
  { value: "score:desc", label: "Best leads first", sort: { key: "score", dir: "desc" } },
  { value: "followers:desc", label: "Most followers", sort: { key: "followers", dir: "desc" } },
  { value: "followers:asc", label: "Fewest followers", sort: { key: "followers", dir: "asc" } },
  { value: "added:desc", label: "Newest saved", sort: { key: "added", dir: "desc" } },
  { value: "dmed:desc", label: "Latest DM first", sort: { key: "dmed", dir: "desc" } },
  { value: "dmed:asc", label: "Oldest DM first", sort: { key: "dmed", dir: "asc" } },
  { value: "business:asc", label: "Business A–Z", sort: { key: "business", dir: "asc" } },
  { value: "city:asc", label: "Town A–Z", sort: { key: "city", dir: "asc" } },
  { value: "account:asc", label: "Account A–Z", sort: { key: "account", dir: "asc" } },
];
const sortValue = (s: IgSort) => `${s.key}:${s.dir}`;

/** "today", "yesterday", "5 days ago", then the date. */
function ago(at: number | undefined, now = Date.now()): string {
  if (!at) return "";
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const days = Math.ceil((start.getTime() - at) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const whenText = (a: IgAccount): string =>
  a.stage === "dmed"
    ? `DMed ${ago(a.dmedAt)}`
    : a.stage === "replied"
      ? `Replied ${ago(a.filedAt)}`
      : a.stage === "skip"
        ? a.filedAt
          ? `Set aside ${ago(a.filedAt)}`
          : "Rejected in Raw Data"
        : a.addedAt
          ? `Saved ${ago(a.addedAt)}`
          : "";

function ScoreChip({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground/60">–</span>;
  return (
    <span
      title="Lead score"
      className={`inline-grid h-6 min-w-6 place-items-center rounded-md px-1 text-[.68rem] font-bold tabular-nums ${
        score >= 70
          ? "bg-success/15 text-success-foreground"
          : score >= 45
            ? "bg-warning/20 text-warning-foreground"
            : "bg-secondary text-muted-foreground"
      }`}
    >
      {score}
    </span>
  );
}

const smallBtn =
  "inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";
const tone = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  soft: "bg-secondary text-foreground hover:bg-secondary/70",
  good: "bg-success/15 text-success-foreground hover:bg-success/25",
  bad: "bg-destructive/10 text-destructive hover:bg-destructive/20",
};

export function InstagramList({
  data,
  update,
  go,
}: {
  data: AdminData;
  update: (fn: (p: AdminData) => AdminData) => void;
  go: (view: "scraper") => void;
}) {
  const [tab, setTab] = useState<IgStage>("todo");
  const [q, setQ] = useState("");
  const [industry, setIndustry] = useState("");
  // null = the order the section opens in (best leads to DM; latest first once messaged)
  const [picked, setPicked] = useState<IgSort | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(100);
  const finder = useInstagramFinder(update);

  const accounts = useMemo(() => igAccounts(data), [data.raw, data.igDms, data.igMarks]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => igCounts(accounts), [accounts]);
  const sort = picked ?? igDefaultSort(tab);
  const industries = useMemo(() => {
    const seen = new Map<string, { label: string; n: number }>();
    for (const a of accounts) {
      const key = a.industry.trim().toLowerCase();
      if (!key) continue;
      const hit = seen.get(key);
      if (hit) hit.n++;
      else seen.set(key, { label: a.industry.trim(), n: 1 });
    }
    return [...seen.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 40);
  }, [accounts]);
  const visible = useMemo(
    () =>
      sortIgAccounts(
        accounts.filter(
          (a) =>
            a.stage === tab &&
            igMatches(a, q) &&
            (!industry || a.industry.trim().toLowerCase() === industry),
        ),
        sort,
      ),
    [accounts, tab, q, industry, sort],
  );
  const page = visible.slice(0, shown);
  const picks = visible.filter((a) => selected.has(a.handle));
  const allPicked = visible.length > 0 && picks.length === visible.length;

  // A new section or filter starts from the top with nothing ticked.
  useEffect(() => {
    setSelected(new Set());
    setShown(100);
  }, [tab, q, industry]);

  const dmsToday = igDmsToday(data.igDms, Date.now(), data.igMarks);
  const messaged = counts.dmed + counts.replied;
  const { targets, rested } = useMemo(() => igFinderTargets(data.raw), [data.raw]);

  const label = (stage: IgStage) => IG_STAGES.find((s) => s.id === stage)?.label ?? stage;
  const at = (handle: string) => `@${handle}`;

  /** File accounts in a section, with a way back. `filed`: DMed earlier, so not counted as today's. */
  function move(list: IgAccount[], to: Section, opts: { filed?: boolean } = {}) {
    const handles = list.map((a) => a.handle);
    if (!handles.length) return;
    const before = { igDms: data.igDms, igMarks: data.igMarks };
    update((prev) => moveIgAccounts(prev, handles, to, Date.now(), opts));
    setSelected(new Set());
    toast.success(
      handles.length === 1
        ? `${at(handles[0])} moved to ${label(to)}`
        : `${handles.length} accounts moved to ${label(to)}`,
      {
        action: {
          label: "Undo",
          onClick: () => update((prev) => restoreIgMarks(prev, handles, before)),
        },
      },
    );
  }

  /** Copy an opener and open the chat. Nothing is sent from here: you paste it and press send. */
  function dm(a: IgAccount) {
    const before = { igDms: data.igDms, igMarks: data.igMarks };
    const handle = openInstagramDm({
      instagram: a.url,
      company: a.business,
      name: a.row?.contactName,
      city: a.city,
      industry: a.industry,
    });
    if (!handle) return;
    update((prev) => logIgDm(prev, handle));
    toast.success(`Opener copied: paste it in the chat. ${at(handle)} is now under DMed.`, {
      action: {
        label: "Undo",
        onClick: () => update((prev) => restoreIgMarks(prev, [handle], before)),
      },
    });
  }

  const openChat = (a: IgAccount) => window.open(igDmUrl(a.handle), "_blank", "noreferrer");

  function confirm(list: IgAccount[]) {
    const handles = list.map((a) => a.handle);
    if (!handles.length) return;
    update((prev) => ({ ...prev, raw: confirmInstagram(prev.raw, handles) }));
    setSelected(new Set());
    toast.success(
      handles.length === 1
        ? `${at(handles[0])} confirmed: now under To DM`
        : `${handles.length} accounts confirmed: now under To DM`,
    );
  }

  function reject(list: IgAccount[]) {
    const handles = list.map((a) => a.handle);
    if (!handles.length) return;
    const before = new Map(list.flatMap((a) => a.rows).map((row) => [row.id, row]));
    update((prev) => ({ ...prev, raw: rejectInstagram(prev.raw, handles) }));
    setSelected(new Set());
    toast.success(
      handles.length === 1
        ? `${at(handles[0])} removed from the business`
        : `${handles.length} wrong accounts removed`,
      {
        action: {
          label: "Undo",
          onClick: () =>
            update((prev) => ({ ...prev, raw: prev.raw.map((row) => before.get(row.id) ?? row) })),
        },
      },
    );
  }

  function toPipeline(a: IgAccount) {
    const row = a.row;
    if (!row) return;
    if (data.deals.some((d) => d.rawId === row.id))
      return void toast.info(`${row.business} is already in the pipeline.`);
    update((prev) => ({
      ...prev,
      deals: [
        ...prev.deals,
        {
          id: uid("d"),
          rawId: row.id,
          name: row.business,
          contact: row.contactName || "",
          email: row.email,
          phone: row.phone,
          value: 0,
          stage: "contacted",
          source: "Instagram DM",
          template: "",
          notes: `Replied on Instagram (@${a.handle}) · ${[row.city, row.industry].filter(Boolean).join(" · ")}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    }));
    toast.success(`${row.business} added to the pipeline`);
  }

  const toggle = (handle: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });

  const setSort = (key: IgSortKey) =>
    setPicked(
      sort.key === key
        ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "account" || key === "business" || key === "city" ? "asc" : "desc" },
    );

  // Plain functions, not components: a component declared here would be rebuilt on every render.
  const th = (k: IgSortKey, children: React.ReactNode, right = false) => (
    <th
      className={`px-3 py-3 font-semibold ${right ? "text-right" : ""}`}
      aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <Button variant="ghost"
        type="button"
        onClick={() => setSort(k)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground ${sort.key === k ? "text-foreground" : ""}`}
      >
        {children}
        {sort.key === k ? (
          sort.dir === "asc" ? (
            <ArrowUp className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ArrowDown className="h-3 w-3" aria-hidden="true" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />
        )}
      </Button>
    </th>
  );

  /** The sections an account can be moved to from where it is. */
  const moveTo = (a: IgAccount) => (
    <select
      aria-label={`Move @${a.handle} to another section`}
      value=""
      onChange={(e) => {
        const to = e.target.value as Section;
        if (to) move([a], to);
      }}
      className="min-h-9 rounded-lg border border-border bg-background px-2 text-xs font-medium text-muted-foreground"
    >
      <option value="">Move to…</option>
      {IG_STAGES.filter(
        (s) => s.id !== "check" && s.id !== a.stage && !(s.id === "todo" && a.stage === "check"),
      ).map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );

  const actions = (a: IgAccount) => (
    <div
      className={`flex flex-wrap items-center gap-1.5 md:justify-end ${a.stage === "check" ? "" : "md:flex-nowrap"}`}
    >
      {a.stage === "check" && (
        <>
          <Button variant="ghost"
            type="button"
            className={`${smallBtn} ${tone.good}`}
            onClick={() => confirm([a])}
            title="You looked: it is their account. Moves it to To DM."
          >
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> It's theirs
          </Button>
          {a.rows.length > 0 && (
            <Button variant="ghost"
              type="button"
              className={`${smallBtn} ${tone.bad}`}
              onClick={() => reject([a])}
              title="Not their account: take it off the business and never suggest it for them again."
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Wrong account
            </Button>
          )}
        </>
      )}
      {(a.stage === "todo" || a.stage === "check") && (
        <>
          <Button variant="ghost"
            type="button"
            className={`${smallBtn} ${a.stage === "todo" ? tone.primary : tone.soft}`}
            onClick={() => dm(a)}
            title="Copies an opener and opens the chat in Instagram. You paste it and press send yourself."
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" /> DM
          </Button>
          <Button variant="ghost"
            type="button"
            className={`${smallBtn} ${tone.soft}`}
            onClick={() => move([a], "dmed")}
            title="You already messaged them: file it under DMed without opening a chat."
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> DMed
          </Button>
        </>
      )}
      {a.stage === "dmed" && (
        <>
          <Button variant="ghost"
            type="button"
            className={`${smallBtn} ${tone.good}`}
            onClick={() => move([a], "replied")}
          >
            <MessageCircleReply className="h-3.5 w-3.5" aria-hidden="true" /> Replied
          </Button>
          <Button variant="ghost"
            type="button"
            className={`${smallBtn} ${tone.soft}`}
            onClick={() => openChat(a)}
            title="Open the chat in Instagram"
          >
            <Instagram className="h-3.5 w-3.5" aria-hidden="true" /> Open chat
          </Button>
        </>
      )}
      {a.stage === "replied" && (
        <>
          {a.row && (
            <Button variant="ghost"
              type="button"
              className={`${smallBtn} ${tone.primary}`}
              onClick={() => toPipeline(a)}
            >
              <ArrowRightCircle className="h-3.5 w-3.5" aria-hidden="true" /> Add to pipeline
            </Button>
          )}
          <Button variant="ghost"
            type="button"
            className={`${smallBtn} ${tone.soft}`}
            onClick={() => openChat(a)}
            title="Open the chat in Instagram"
          >
            <Instagram className="h-3.5 w-3.5" aria-hidden="true" /> Open chat
          </Button>
        </>
      )}
      {a.stage === "skip" && (
        <Button variant="ghost"
          type="button"
          className={`${smallBtn} ${tone.soft}`}
          onClick={() => move([a], "todo")}
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Back to To DM
        </Button>
      )}
      {moveTo(a)}
    </div>
  );

  const handleLink = (a: IgAccount) => (
    <a
      href={a.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 font-semibold text-primary hover:underline"
      title={`Open @${a.handle} on Instagram`}
    >
      <Instagram className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">@{a.handle}</span>
    </a>
  );
  /** Why we think it is theirs: it matters before you message; afterwards it is only in the way. */
  const reason = (a: IgAccount, oneLine: boolean) =>
    a.stage === "check" ? (
      <span className="mt-1 flex items-start gap-1 text-xs font-normal text-warning-foreground">
        <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        {/* "the name matches (check it's the right business)" already says "check" up front */}
        <span>
          Check:{" "}
          {/^the name matches\s*(\(|$)/i.test(a.why)
            ? "only the name matches. Make sure it is this business and not another with the same name"
            : a.why.replace(/\s*\(check[^)]*\)\s*$/i, "")}
        </span>
      </span>
    ) : (
      a.stage === "todo" &&
      a.rows.length > 0 && (
        <span
          className={`mt-0.5 block text-xs font-normal text-muted-foreground ${oneLine ? "truncate" : ""}`}
          title={a.why}
        >
          {a.why}
        </span>
      )
    );
  const account = (a: IgAccount) => (
    <>
      {handleLink(a)}
      {reason(a, true)}
    </>
  );

  const business = (a: IgAccount) =>
    a.row ? (
      <>
        <span className="font-semibold">{a.business}</span>
        {a.row.contactName && (
          <span className="block text-xs text-muted-foreground">
            {a.row.contactName}
            {a.row.contactTitle ? ` · ${a.row.contactTitle}` : ""}
          </span>
        )}
        {a.others.length > 0 ? (
          <span
            className="mt-0.5 block text-xs text-warning-foreground"
            title={a.others.join("\n")}
          >
            Same account on {a.others.length} other{" "}
            {a.others.length === 1 ? "business" : "businesses"}: {a.others.slice(0, 2).join(", ")}
            {a.others.length > 2 ? "…" : ""}
          </span>
        ) : (
          a.rows.length > 1 && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {a.rows.length} saved listings, one account
            </span>
          )
        )}
      </>
    ) : (
      <span className="text-muted-foreground">Not saved in Raw Data</span>
    );

  const emptyText =
    q || industry
      ? "Nothing in this section matches the search."
      : tab === "todo"
        ? counts.check
          ? "Nothing left to DM here. Accounts that need a look first are under Check first."
          : "No accounts to DM yet. Save businesses from the Data Scraper, then find their Instagram above."
        : tab === "check"
          ? "Nothing to check: every account here is confirmed as theirs."
          : tab === "dmed"
            ? "Nobody is waiting for an answer. Accounts land here when you press DM, or when you file them as DMed."
            : tab === "replied"
              ? "No replies filed yet. When someone answers, move them here from DMed."
              : "Nothing set aside.";

  return (
    <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
      <p className="max-w-3xl text-sm text-muted-foreground">
        One line per Instagram account, however many times the business was saved.{" "}
        <strong className="text-foreground">DM</strong> copies an opener and opens the chat: you
        paste it and send it yourself, nothing is sent from here.
      </p>

      {(targets.length > 0 || rested > 0 || finder.busy || finder.message) && (
        <Panel className="!p-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1 basis-72 text-sm">
              <div className="font-semibold">
                {targets.length > 0
                  ? `${targets.length} saved ${targets.length === 1 ? "business has" : "businesses have"} no Instagram yet`
                  : rested > 0
                    ? "Every business without an Instagram was searched for in the last 30 days"
                    : "Find Instagram"}
              </div>
              {targets.length > 0 && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Their listing and website are read first, free. A search is used only when those
                  have none: usually 1 per business, {targets.length} or so at most.
                  {rested > 0
                    ? ` ${rested} searched for in the last 30 days ${rested === 1 ? "is" : "are"} left alone.`
                    : ""}
                </div>
              )}
            </div>
            {finder.busy ? (
              <div className="flex items-center gap-3 text-sm" role="status">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span className="tabular-nums">
                  {finder.progress.done}/{finder.progress.total}
                </span>
                <Btn
                  variant="ghost"
                  onClick={() => void finder.stop()}
                  disabled={finder.stopping || !finder.canStop}
                >
                  <SquareStop className="h-4 w-4" /> {finder.stopping ? "Stopping…" : "Stop"}
                </Btn>
              </div>
            ) : (
              targets.length > 0 && (
                <Btn onClick={() => void finder.run(targets)}>
                  <Search className="h-4 w-4" /> Find Instagram for {targets.length}
                </Btn>
              )
            )}
          </div>
          {finder.message && (
            <p className="mt-3 text-sm text-muted-foreground" role="status">
              {finder.message}
            </p>
          )}
        </Panel>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div
          role="tablist"
          aria-label="Instagram sections"
          className="flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-card p-1"
        >
          {IG_STAGES.map((s) => (
            <Button variant="ghost"
              key={s.id}
              type="button"
              role="tab"
              aria-selected={tab === s.id}
              title={s.hint}
              onClick={() => {
                setTab(s.id);
                setPicked(null);
              }}
              className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                tab === s.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {s.label}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  tab === s.id ? "bg-primary-foreground/20" : "bg-secondary text-muted-foreground"
                }`}
              >
                {counts[s.id]}
              </span>
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          <strong className={dmsToday >= 40 ? "text-warning-foreground" : "text-foreground"}>
            {dmsToday} DMed today
          </strong>
          {dmsToday >= 40
            ? " (plenty for one day: Instagram restricts accounts that send many cold messages)"
            : ""}
          {messaged > 0 && (
            <>
              {" "}
              · {counts.replied} of {messaged} replied (
              {Math.round((counts.replied / messaged) * 100)}%)
            </>
          )}
        </p>
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
            placeholder="Search account, business or town"
            aria-label="Search this section"
            className={`${inputCls} pl-8`}
          />
        </div>
        {industries.length > 1 && (
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            aria-label="Trade"
            className="min-h-10 rounded-lg border border-border bg-background px-2.5 text-sm"
          >
            <option value="">All trades</option>
            {industries.map(([key, v]) => (
              <option key={key} value={key}>
                {v.label} ({v.n})
              </option>
            ))}
          </select>
        )}
        <select
          value={sortValue(sort)}
          onChange={(e) => setPicked(SORTS.find((s) => s.value === e.target.value)?.sort ?? null)}
          aria-label="Sort"
          className="min-h-10 rounded-lg border border-border bg-background px-2.5 text-sm"
        >
          {!SORTS.some((s) => s.value === sortValue(sort)) && (
            <option value={sortValue(sort)}>Sorted by column</option>
          )}
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {visible.length} {visible.length === 1 ? "account" : "accounts"}
        </span>
      </div>

      {visible.length > 0 && (
        <div className="flex min-h-9 flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allPicked}
              onChange={(e) =>
                setSelected(e.target.checked ? new Set(visible.map((a) => a.handle)) : new Set())
              }
              className="h-4 w-4 rounded border-border"
            />
            <span className="text-muted-foreground">
              {picks.length ? `${picks.length} selected` : `Select all ${visible.length}`}
            </span>
          </label>
          {picks.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">Move to</span>
              {tab === "check" && (
                <Button variant="ghost"
                  type="button"
                  className={`${smallBtn} ${tone.good}`}
                  onClick={() => confirm(picks)}
                >
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> To DM (they're theirs)
                </Button>
              )}
              {tab !== "todo" && tab !== "check" && (
                <Button variant="ghost"
                  type="button"
                  className={`${smallBtn} ${tone.soft}`}
                  onClick={() => move(picks, "todo")}
                >
                  To DM
                </Button>
              )}
              {tab !== "dmed" && (
                <Button variant="ghost"
                  type="button"
                  className={`${smallBtn} ${tone.soft}`}
                  onClick={() => move(picks, "dmed", { filed: true })}
                  title="File these as already DMed. They are not counted as today's DMs."
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" /> DMed
                </Button>
              )}
              {tab !== "replied" && (
                <Button variant="ghost"
                  type="button"
                  className={`${smallBtn} ${tone.soft}`}
                  onClick={() => move(picks, "replied")}
                >
                  <MessageCircleReply className="h-3.5 w-3.5" aria-hidden="true" /> Replied
                </Button>
              )}
              {tab !== "skip" && (
                <Button variant="ghost"
                  type="button"
                  className={`${smallBtn} ${tone.soft}`}
                  onClick={() => move(picks, "skip")}
                >
                  Not a fit
                </Button>
              )}
              {tab === "check" && picks.some((a) => a.rows.length > 0) && (
                <Button variant="ghost"
                  type="button"
                  className={`${smallBtn} ${tone.bad}`}
                  onClick={() => reject(picks.filter((a) => a.rows.length > 0))}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" /> Wrong accounts
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {/* Computer: a table with sortable columns */}
      <Panel className="hidden overflow-x-auto !p-0 md:block">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="w-10 px-2 py-3" />
              {th("account", "Account")}
              {th("business", "Business")}
              {th("city", "Town")}
              {th("followers", "Followers", true)}
              {th("score", "Score", true)}
              {tab === "todo" || tab === "check" ? th("added", "Saved") : th("dmed", "When")}
              <th className="px-3 py-3 text-right font-semibold uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {page.map((a) => (
              <tr
                key={a.handle}
                className="border-b border-border align-top last:border-0 hover:bg-secondary/40"
              >
                <td className="px-2 py-3 text-center">
                  <input
                    type="checkbox"
                    aria-label={`Select @${a.handle}`}
                    checked={selected.has(a.handle)}
                    onChange={() => toggle(a.handle)}
                    className="h-4 w-4 rounded border-border"
                  />
                </td>
                <td className="max-w-[230px] px-3 py-3">{account(a)}</td>
                <td className="max-w-[260px] px-3 py-3">{business(a)}</td>
                <td className="px-3 py-3 text-muted-foreground">
                  {a.city}
                  {a.industry && <span className="block text-xs">{a.industry}</span>}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {followersLabel(a.followers) || "–"}
                </td>
                <td className="px-3 py-3 text-right">
                  <ScoreChip score={a.score} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                  {whenText(a).replace(/^(Saved|DMed|Replied|Set aside) /, "")}
                </td>
                <td className="px-3 py-3">{actions(a)}</td>
              </tr>
            ))}
            {page.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      {/* Phone: one card per account, with buttons big enough to tap */}
      <div className="space-y-3 md:hidden">
        {page.map((a) => (
          <Panel key={a.handle} className="!p-4">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                aria-label={`Select @${a.handle}`}
                checked={selected.has(a.handle)}
                onChange={() => toggle(a.handle)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-border"
              />
              <div className="min-w-0 flex-1 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    {handleLink(a)}
                    {followersLabel(a.followers) && (
                      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                        {followersLabel(a.followers)} followers
                      </span>
                    )}
                  </div>
                  <ScoreChip score={a.score} />
                </div>
                {reason(a, false)}
                <div className="mt-2">{business(a)}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {[a.city, a.industry, whenText(a)].filter(Boolean).join(" · ")}
                </div>
                <div className="mt-3">{actions(a)}</div>
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
            Show {Math.min(100, visible.length - page.length)} more ({visible.length - page.length}{" "}
            left)
          </Btn>
        </div>
      )}

      {tab === "todo" &&
        counts.todo === 0 &&
        counts.check === 0 &&
        targets.length === 0 &&
        !q &&
        !industry && (
          <Btn variant="soft" onClick={() => go("scraper")}>
            <ArrowRightCircle className="h-4 w-4" /> Find businesses in the Data Scraper
          </Btn>
        )}
    </div>
  );
}
