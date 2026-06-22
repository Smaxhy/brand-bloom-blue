import { useState, useMemo } from "react";
import { Plus, Check, X, Upload, Trash2, ArrowRightCircle, Search, Mail, AlertTriangle } from "lucide-react";
import { type AdminData, type RawBusiness, uid } from "../store";
import { Panel, StatCard, Modal, Field, inputCls, Btn } from "../ui";


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

  function setStatus(id: string, status: RawBusiness["status"]) {
    update((p) => ({ ...p, raw: p.raw.map((r) => (r.id === id ? { ...r, status } : r)) }));
  }
  function remove(id: string) {
    update((p) => ({ ...p, raw: p.raw.filter((r) => r.id !== id) }));
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
    .filter((r) => !q || (r.business + r.email + r.city + r.industry).toLowerCase().includes(q.toLowerCase()));

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
        <StatCard label="Emails Sent" value={String(sentCount)} hint={lastSentAt ? `Last: ${new Date(lastSentAt).toLocaleString()}` : "No sends yet"} icon={Mail} accent="oklch(.7 .18 150)" />
        <StatCard label="Accepted" value={String(counts.accepted)} hint="Ready to email" icon={Check} accent="var(--brand-violet)" />
        <StatCard label="Duplicate emails" value={String(Object.values(emailCounts).filter((n) => n > 1).length)} hint="Same address appears more than once" icon={AlertTriangle} accent="var(--brand-coral)" />
      </div>

      {sentCount > 0 && (
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-base font-bold">Businesses we've emailed ({sentCount})</h3>
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1 text-sm">
            {data.raw
              .filter((r) => r.lastEmailedAt)
              .slice()
              .sort((a, b) => (b.lastEmailedAt ?? 0) - (a.lastEmailedAt ?? 0))
              .map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{r.business}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.email}</div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">{new Date(r.lastEmailedAt!).toLocaleDateString()}</div>
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
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className={`${inputCls} pl-8`} />
        </div>
        <Btn className="ml-auto" onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" /> Import scraped data
        </Btn>
      </div>

      <p className="text-sm text-muted-foreground">
        Your scraping dump lives here. <strong className="text-foreground">Accept</strong> the businesses worth contacting — accepted
        rows become available in the Email / GHL tab for outreach.
      </p>

      <Panel className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
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
                <td className="px-4 py-3 font-semibold">
                  {r.business}
                  {r.contactName && (
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {r.contactName}
                      {r.contactTitle ? ` · ${r.contactTitle}` : ""}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span>{r.email}</span>
                    {r.email && emailCounts[r.email.trim().toLowerCase()] > 1 && (
                      <span title="This email address appears more than once in your data" className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[.6rem] font-semibold uppercase" style={{ background: "color-mix(in oklab, var(--brand-coral) 15%, transparent)", color: "var(--brand-coral)" }}>
                        <AlertTriangle className="h-2.5 w-2.5" /> dup
                      </span>
                    )}
                    {r.lastEmailedAt && (
                      <span title={`Emailed ${new Date(r.lastEmailedAt).toLocaleString()}`} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[.6rem] font-semibold uppercase" style={{ background: "color-mix(in oklab, oklch(.7 .18 150) 18%, transparent)", color: "oklch(.45 .15 150)" }}>
                        <Mail className="h-2.5 w-2.5" /> sent
                      </span>
                    )}
                  </div>
                </td>

                <td className="px-4 py-3 text-muted-foreground">{r.phone}</td>
                <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                  {r.website ? (
                    <a href={r.website.startsWith("http") ? r.website : `https://${r.website}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {r.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </a>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{r.city}</td>
                <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{r.industry}</td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{
                      background:
                        r.status === "accepted" ? "color-mix(in oklab, oklch(.7 .18 150) 18%, transparent)"
                        : r.status === "rejected" ? "color-mix(in oklab, var(--destructive) 14%, transparent)"
                        : "var(--secondary)",
                      color:
                        r.status === "accepted" ? "oklch(.45 .15 150)"
                        : r.status === "rejected" ? "var(--destructive)"
                        : "var(--muted-foreground)",
                    }}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {r.status !== "accepted" && (
                      <button onClick={() => setStatus(r.id, "accepted")} className="grid h-7 w-7 place-items-center rounded-md text-[oklch(.55_.15_150)] hover:bg-[oklch(.7_.18_150)]/15" title="Accept">
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    {r.status !== "rejected" && (
                      <button onClick={() => setStatus(r.id, "rejected")} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary" title="Reject">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => pushToPipeline(r)} className="grid h-7 w-7 place-items-center rounded-md text-primary hover:bg-primary/10" title="Add to pipeline">
                      <ArrowRightCircle className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(r.id)} className="grid h-7 w-7 place-items-center rounded-md text-destructive hover:bg-destructive/10" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">No rows. Import some scraped data to get started.</td></tr>
            )}
          </tbody>
        </table>
      </Panel>

      {counts.accepted > 0 && (
        <Btn variant="soft" onClick={() => go("email")}>
          <ArrowRightCircle className="h-4 w-4" /> {counts.accepted} accepted — go to Email / GHL
        </Btn>
      )}

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import scraped businesses" wide>
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
          <Btn variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Btn>
          <Btn onClick={runImport}><Plus className="h-4 w-4" /> Import</Btn>
        </div>
      </Modal>
    </div>
  );
}
