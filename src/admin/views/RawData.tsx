import { useState, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Plus,
  Check,
  X,
  Upload,
  Trash2,
  ArrowRightCircle,
  Search,
  Mail,
  AlertTriangle,
  Eye,
  EyeOff,
  Send,
  Loader2,
  SquareStop,
} from "lucide-react";
import { type AdminData, type RawBusiness, type ScanJobLite, type EnrichResult, uid, startScan, stepScan, scanStatus, cancelScan } from "../store";
import { createRevealScanControl } from "../reveal-scan-control";
import { mergeRawReveal, needsRawEnrichment, rawScanPerson, runRawReveal } from "../raw-reveal";
import { type Sequence, listSequences, enrollLeads } from "../outreach";
import { Panel, StatCard, Modal, Field, inputCls, Btn } from "../ui";

function maskEmail(email: string): string {
  if (!email.includes("@")) return "***";
  const [local, domain] = email.split("@");
  const maskedLocal = local.length > 2 ? local[0] + "***" : "***";
  const domainParts = domain.split(".");
  const maskedDomain =
    domainParts.length > 1 ? domainParts[0][0] + "***." + domainParts.slice(1).join(".") : "***";
  return `${maskedLocal}@${maskedDomain}`;
}

export function RawData({
  data,
  update,
  go,
}: {
  data: AdminData;
  update: (fn: (p: AdminData) => AdminData) => void;
  go: (v: any) => void;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [filter, setFilter] = useState<"all" | "raw" | "accepted" | "rejected" | "sent">("all");
  const [q, setQ] = useState("");
  // Outreach: add selected rows to a sequence
  const [seqOpen, setSeqOpen] = useState(false);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [seqId, setSeqId] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [enrollResult, setEnrollResult] = useState<{
    enrolled: number;
    skipped: { email: string; reason: string }[];
  } | null>(null);
  useEffect(() => {
    if (!seqOpen) return;
    void listSequences()
      .then((s) => {
        setSequences(s);
        if (!seqId && s[0]) setSeqId(s[0].id);
      })
      .catch((e) => toast.error((e as Error).message));
  }, [seqOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addSelectedToSequence() {
    const picked = data.raw.filter((r) => selectedIds.has(r.id) && r.email);
    if (!seqId) return toast.error("Pick a sequence.");
    if (!picked.length) return toast.error("Select rows that have an email address.");
    setEnrolling(true);
    const res = await enrollLeads(
      seqId,
      picked.map((r) => ({
        company: r.business,
        website: r.website,
        contactName: r.contactName,
        contactTitle: r.contactTitle,
        email: r.email,
        emailSource: r.emailSource || r.source,
        emailGuessed: r.emailSource ? r.emailSource === "Guess" : /guess/i.test(r.source || ""),
        score: r.score,
        scoreReasons: r.scoreWhy,
        ai: r.ai ?? null,
        phone: r.phone,
        linkedin: r.linkedin,
        city: r.city,
        industry: r.industry,
        source: r.source,
        rawId: r.id,
      })),
    );
    setEnrolling(false);
    if (!res.ok) return toast.error(res.error || "Could not add to sequence");
    setEnrollResult({ enrolled: res.enrolled, skipped: res.skipped });
    if (res.enrolled) {
      update((p) => ({
        ...p,
        raw: p.raw.map((r) =>
          selectedIds.has(r.id) && r.email
            ? { ...r, status: "accepted" as const, lastEmailedAt: r.lastEmailedAt ?? Date.now() }
            : r,
        ),
      }));
      toast.success(`${res.enrolled} lead${res.enrolled === 1 ? "" : "s"} added to the sequence`);
    }
  }
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [revealBusy, setRevealBusy] = useState(false);
  const [stopBusy, setStopBusy] = useState(false);
  const [revealProgress, setRevealProgress] = useState({ done: 0, total: 0 });
  const [revealJob, setRevealJob] = useState<ScanJobLite | null>(null);
  const revealControl = useRef<ReturnType<typeof createRevealScanControl> | null>(null);
  const [revealMessage, setRevealMessage] = useState("");

  async function revealRows(ids: Set<string>) {
    if (revealControl.current) return;
    setRevealedIds((prev) => new Set([...prev, ...ids]));
    const targets = data.raw.filter((row) => ids.has(row.id) && needsRawEnrichment(row));
    if (!targets.length) return;
    const control = createRevealScanControl();
    revealControl.current = control;
    setRevealBusy(true);
    setRevealProgress({ done: 0, total: targets.length });
    setRevealMessage("");
    const apply = (results: EnrichResult[]) => {
      const byId = new Map(results.map((result) => [result.id, result]));
      if (!byId.size) return;
      update((prev) => ({ ...prev, raw: prev.raw.map((row) => {
        const result = byId.get(row.id);
        return result ? mergeRawReveal(row, result) : row;
      }) }));
    };
    try {
      const warnings = await runRawReveal(targets.map(rawScanPerson), {
        start: (people) => startScan(people, { useClaude: false, usePaid: false, revealPhone: true, findLinkedin: false }, `Raw Data · ${people.length} businesses`, control.canContinue),
        step: (id) => stepScan(id, control.canContinue), status: (id) => scanStatus(id, true),
        canContinue: control.canContinue,
        wait: () => new Promise((resolve) => setTimeout(resolve, 3500)),
        onJob: setRevealJob, onRows: apply,
        onProgress: (done, total) => setRevealProgress({ done, total }),
      });
      setRevealMessage(warnings.length ? warnings.join(" · ") : await control.canContinue() ? "Reveal finished. Found details are saved; unavailable emails remain blank." : "Reveal stopped. Completed details are saved.");
    } catch (error) {
      setRevealMessage(`Reveal could not continue: ${(error as Error).message}. Completed details remain saved.`);
    } finally {
      setRevealBusy(false);
      setRevealJob(null);
      revealControl.current = null;
    }
  }

  async function stopReveal() {
    if (!revealJob || stopBusy || !revealControl.current) return;
    setStopBusy(true);
    try { await revealControl.current.stop(() => cancelScan(revealJob.id)); }
    catch (error) { toast.error(`Could not stop Reveal: ${(error as Error).message}`); }
    finally { setStopBusy(false); }
  }

  function setStatus(id: string, status: RawBusiness["status"]) {
    update((p) => ({ ...p, raw: p.raw.map((r) => (r.id === id ? { ...r, status } : r)) }));
  }
  function bulkSetStatus(ids: Set<string>, status: RawBusiness["status"]) {
    if (!ids.size) return;
    update((p) => ({
      ...p,
      raw: p.raw.map((r) => (ids.has(r.id) ? { ...r, status } : r)),
    }));
  }
  function acceptAllVisible() {
    const ids = new Set(rows.filter((r) => r.status !== "accepted").map((r) => r.id));
    bulkSetStatus(ids, "accepted");
    clearSelection();
  }
  function acceptSelected() {
    bulkSetStatus(selectedIds, "accepted");
    clearSelection();
  }
  function rejectSelected() {
    bulkSetStatus(selectedIds, "rejected");
    clearSelection();
  }
  function remove(id: string) {
    update((p) => ({ ...p, raw: p.raw.filter((r) => r.id !== id) }));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllVisible() {
    setSelectedIds(new Set(rows.map((r) => r.id)));
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }
  function revealSelected() {
    void revealRows(new Set(selectedIds));
  }
  function hideSelected() {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      for (const id of selectedIds) next.delete(id);
      return next;
    });
  }
  function toggleReveal(id: string) {
    if (!revealedIds.has(id) || !data.raw.find((row) => row.id === id)?.email) {
      void revealRows(new Set([id]));
      return;
    }
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pushToPipeline(r: RawBusiness) {
    update((p) => ({
      ...p,
      deals: [
        ...p.deals,
        {
          id: uid("d"),
          name: r.business,
          contact: r.contactName || "",
          email: r.email,
          phone: r.phone,
          value: 0,
          stage: "new",
          source: r.source || "Scraped",
          template: "",
          notes: `From raw data · ${r.city} · ${r.industry}${r.contactTitle ? ` · ${r.contactTitle}` : ""}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    }));
  }

  function runImport() {
    // accepts CSV or tab-separated: business, email, phone, website, city, industry
    const rows = paste
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line): RawBusiness => {
        const parts = line.split(/[\t,;]/).map((x) => x.trim());
        return {
          id: uid("r"),
          business: parts[0] || "Unknown",
          email: parts[1] || "",
          phone: parts[2] || "",
          website: parts[3] || "",
          city: parts[4] || "",
          industry: parts[5] || "",
          status: "raw",
          scrapedAt: Date.now(),
        };
      });
    update((p) => ({ ...p, raw: [...rows, ...p.raw] }));
    setPaste("");
    setImportOpen(false);
  }

  // Map of normalized email → count of times it appears in raw[]
  const emailCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of data.raw) {
      const k = (r.email || "").trim().toLowerCase();
      if (!k) continue;
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [data.raw]);

  const rows = data.raw
    .filter((r) => {
      if (filter === "sent") return !!r.lastEmailedAt;
      if (filter === "all") return r.status !== "accepted";
      return r.status === filter;
    })
    .filter(
      (r) =>
        !q || (r.business + r.email + r.city + r.industry).toLowerCase().includes(q.toLowerCase()),
    );

  const anyScored = rows.some((r) => typeof r.score === "number");
  if (anyScored) rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const sentCount = data.raw.filter((r) => r.lastEmailedAt).length;
  const lastSentAt = data.raw.reduce((m, r) => Math.max(m, r.lastEmailedAt ?? 0), 0);

  const counts = {
    all: data.raw.filter((r) => r.status !== "accepted").length,
    raw: data.raw.filter((r) => r.status === "raw").length,
    accepted: data.raw.filter((r) => r.status === "accepted").length,
    rejected: data.raw.filter((r) => r.status === "rejected").length,
    sent: sentCount,
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Emails Sent"
          value={String(sentCount)}
          hint={lastSentAt ? `Last: ${new Date(lastSentAt).toLocaleString()}` : "No sends yet"}
          icon={Mail}
          accent="oklch(.7 .18 150)"
        />
        <StatCard
          label="Accepted"
          value={String(counts.accepted)}
          hint="Ready to email"
          icon={Check}
          accent="var(--brand-violet)"
        />
        <StatCard
          label="Duplicate emails"
          value={String(Object.values(emailCounts).filter((n) => n > 1).length)}
          hint="Same address appears more than once"
          icon={AlertTriangle}
          accent="var(--brand-coral)"
        />
      </div>

      {sentCount > 0 && (
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-base font-bold">
              Businesses we've emailed ({sentCount})
            </h3>
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1 text-sm">
            {data.raw
              .filter((r) => r.lastEmailedAt)
              .slice()
              .sort((a, b) => (b.lastEmailedAt ?? 0) - (a.lastEmailedAt ?? 0))
              .map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{r.business}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.email}</div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {new Date(r.lastEmailedAt ?? 0).toLocaleDateString()}
                  </div>
                </div>
              ))}
          </div>
        </Panel>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {(["all", "raw", "accepted", "rejected", "sent"] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                clearSelection();
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              clearSelection();
            }}
            placeholder="Search…"
            className={`${inputCls} pl-8`}
          />
        </div>
        <Btn className="ml-auto" onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" /> Import scraped data
        </Btn>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rows.length > 0 && rows.every((r) => selectedIds.has(r.id))}
              onChange={(e) => {
                if (e.target.checked) selectAllVisible();
                else clearSelection();
              }}
              className="h-4 w-4 rounded border-border"
            />
            <span className="text-muted-foreground">{selectedIds.size} selected</span>
          </label>
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={acceptSelected}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[oklch(.7_.18_150)]/15 px-3 py-1.5 text-xs font-semibold text-[oklch(.45_.15_150)] hover:bg-[oklch(.7_.18_150)]/25"
              >
                <Check className="h-3.5 w-3.5" /> Accept selected
              </button>
              <button
                onClick={rejectSelected}
                className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20"
              >
                <X className="h-3.5 w-3.5" /> Reject selected
              </button>
              <button
                onClick={() => {
                  setEnrollResult(null);
                  setSeqOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand-violet)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                <Send className="h-3.5 w-3.5" /> Add to sequence
              </button>
              <Btn
                onClick={revealSelected}
                variant="soft"
                disabled={revealBusy}
              >
                {revealBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Reveal emails
              </Btn>
              <button
                onClick={hideSelected}
                className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary/80"
              >
                <EyeOff className="h-3.5 w-3.5" /> Hide emails
              </button>
            </>
          )}
          {rows.some((r) => r.status !== "accepted") && (
            <button
              onClick={acceptAllVisible}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[oklch(.7_.18_150)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              title="Accept every row currently visible in this filter"
            >
              <Check className="h-3.5 w-3.5" /> Accept all visible (
              {rows.filter((r) => r.status !== "accepted").length})
            </button>
          )}
        </div>
      )}

      {revealBusy && (
        <div className="flex flex-wrap items-center gap-3 text-sm" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Revealing {revealProgress.done}/{revealProgress.total}</span>
          <Btn variant="ghost" onClick={() => void stopReveal()} disabled={stopBusy || !revealJob}>
            <SquareStop className="h-4 w-4" /> {stopBusy ? "Stopping…" : "Stop reveal"}
          </Btn>
        </div>
      )}
      {revealMessage && <p className="text-sm text-muted-foreground" role="status">{revealMessage}</p>}

      <p className="text-sm text-muted-foreground">
        Your scraping dump lives here. <strong className="text-foreground">Accept</strong> the
        businesses worth contacting — accepted rows can be added to an outreach sequence (select →{" "}
        <strong className="text-foreground">Add to sequence</strong>).
      </p>

      <Panel className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-2 py-3 text-center">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && rows.every((r) => selectedIds.has(r.id))}
                  onChange={(e) => {
                    if (e.target.checked) selectAllVisible();
                    else clearSelection();
                  }}
                  className="h-4 w-4 rounded border-border"
                />
              </th>
              <th className="px-4 py-3 font-semibold">Business</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Website</th>
              <th className="hidden px-4 py-3 font-semibold lg:table-cell">City</th>
              <th className="hidden px-4 py-3 font-semibold lg:table-cell">Industry</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                <td className="px-2 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(r.id)}
                    onChange={() => toggleSelect(r.id)}
                    className="h-4 w-4 rounded border-border"
                  />
                </td>
                <td className="px-4 py-3 font-semibold">
                  <span className="inline-flex items-center gap-2">
                    {typeof r.score === "number" && (
                      <span
                        title={(r.scoreWhy || []).join("\n") || "Lead score"}
                        className={`inline-grid h-6 min-w-6 place-items-center rounded-md px-1 text-[.68rem] font-bold tabular-nums ${
                          r.score >= 70
                            ? "bg-[oklch(.7_.18_150)]/15 text-[oklch(.4_.14_150)]"
                            : r.score >= 45
                              ? "bg-[oklch(.8_.16_80)]/20 text-[oklch(.45_.12_70)]"
                              : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {r.score}
                      </span>
                    )}
                    {r.business}
                  </span>
                  {r.contactName && (
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {r.contactName}
                      {r.contactTitle ? ` · ${r.contactTitle}` : ""}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs break-all">
                      {r.email ? revealedIds.has(r.id) ? r.email : maskEmail(r.email) : "Not found yet"}
                    </span>
                    {r.emailSource === "Guess" && r.email && (
                      <span
                        title="Pattern guess (e.g. info@domain) — verified against the mail server before it is sent"
                        className="rounded-full bg-secondary px-1.5 py-0.5 text-[.6rem] font-semibold uppercase text-muted-foreground"
                      >
                        guess
                      </span>
                    )}
                    <Btn
                      onClick={() => toggleReveal(r.id)}
                      variant="ghost"
                      disabled={revealBusy}
                      className="!p-1"
                      title={revealedIds.has(r.id) && r.email ? "Hide email" : "Reveal email"}
                      aria-label={revealedIds.has(r.id) && r.email ? "Hide email" : "Reveal email"}
                    >
                      {revealedIds.has(r.id) && r.email ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Btn>
                    {r.email && emailCounts[r.email.trim().toLowerCase()] > 1 && (
                      <span
                        title="This email address appears more than once in your data"
                        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[.6rem] font-semibold uppercase"
                        style={{
                          background: "color-mix(in oklab, var(--brand-coral) 15%, transparent)",
                          color: "var(--brand-coral)",
                        }}
                      >
                        <AlertTriangle className="h-2.5 w-2.5" /> dup
                      </span>
                    )}
                    {r.lastEmailedAt && (
                      <span
                        title={`Emailed ${new Date(r.lastEmailedAt).toLocaleString()}`}
                        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[.6rem] font-semibold uppercase"
                        style={{
                          background: "color-mix(in oklab, oklch(.7 .18 150) 18%, transparent)",
                          color: "oklch(.45 .15 150)",
                        }}
                      >
                        <Mail className="h-2.5 w-2.5" /> sent
                      </span>
                    )}
                  </div>
                </td>

                <td className="px-4 py-3 text-muted-foreground">{r.phone}</td>
                <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                  {r.website ? (
                    <a
                      href={r.website.startsWith("http") ? r.website : `https://${r.website}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {r.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </a>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{r.city}</td>
                <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                  {r.industry}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{
                      background:
                        r.status === "accepted"
                          ? "color-mix(in oklab, oklch(.7 .18 150) 18%, transparent)"
                          : r.status === "rejected"
                            ? "color-mix(in oklab, var(--destructive) 14%, transparent)"
                            : "var(--secondary)",
                      color:
                        r.status === "accepted"
                          ? "oklch(.45 .15 150)"
                          : r.status === "rejected"
                            ? "var(--destructive)"
                            : "var(--muted-foreground)",
                    }}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {r.status !== "accepted" && (
                      <button
                        onClick={() => setStatus(r.id, "accepted")}
                        className="grid h-7 w-7 place-items-center rounded-md text-[oklch(.55_.15_150)] hover:bg-[oklch(.7_.18_150)]/15"
                        title="Accept"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    {r.status !== "rejected" && (
                      <button
                        onClick={() => setStatus(r.id, "rejected")}
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
                        title="Reject"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => pushToPipeline(r)}
                      className="grid h-7 w-7 place-items-center rounded-md text-primary hover:bg-primary/10"
                      title="Add to pipeline"
                    >
                      <ArrowRightCircle className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(r.id)}
                      className="grid h-7 w-7 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No rows. Import some scraped data to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      {counts.accepted > 0 && (
        <Btn variant="soft" onClick={() => go("email")}>
          <ArrowRightCircle className="h-4 w-4" /> {counts.accepted} accepted — go to Email / GHL
        </Btn>
      )}

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import scraped businesses"
        wide
      >
        <p className="mb-3 text-sm text-muted-foreground">
          Paste rows — one business per line. Columns separated by comma, semicolon or tab:
          <br />
          <code className="text-xs">business, email, phone, website, city, industry</code>
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={"Acme Vastgoed, info@acme.be, +32 9 000 00 00, acme.be, Gent, Real Estate"}
          className={`${inputCls} min-h-[180px] font-mono text-xs`}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setImportOpen(false)}>
            Cancel
          </Btn>
          <Btn onClick={runImport}>
            <Plus className="h-4 w-4" /> Import
          </Btn>
        </div>
      </Modal>
      <Modal
        open={seqOpen}
        onClose={() => setSeqOpen(false)}
        title="Add selected leads to a sequence"
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {data.raw.filter((r) => selectedIds.has(r.id) && r.email).length} selected rows have an
            email. Guessed addresses are checked for a working mail server first; anything on the
            suppression list is skipped.
          </p>
          {sequences.length ? (
            <Field label="Sequence">
              <select className={inputCls} value={seqId} onChange={(e) => setSeqId(e.target.value)}>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.status !== "active" ? ` (${s.status})` : ""}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
              No sequences yet — create one in the Outreach tab first.
            </p>
          )}
          {enrollResult && (
            <div className="rounded-lg border border-border p-3 text-sm">
              <div className="font-semibold">{enrollResult.enrolled} added</div>
              {enrollResult.skipped.length > 0 && (
                <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto text-xs text-muted-foreground">
                  {enrollResult.skipped.map((k, i) => (
                    <li key={i}>
                      {k.email} — {k.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setSeqOpen(false)}>
              Close
            </Btn>
            <Btn
              onClick={() => void addSelectedToSequence()}
              disabled={enrolling || !sequences.length}
            >
              {enrolling ? "Adding…" : "Add to sequence"}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
