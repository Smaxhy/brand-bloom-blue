import { useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, Loader2 } from "lucide-react";
import type { ScanJobLite } from "../store";
import { Panel } from "../ui";

/**
 * A stored scan label ("roofing, roofer, roof repair · Denver, CO · 96") as a
 * short title, the place and the number of businesses.
 */
export function describeScan(label: string): { title: string; place: string; count: number | null } {
  const parts = (label || "").split(" · ").map((p) => p.trim());
  const last = parts[parts.length - 1] || "";
  const countMatch = /^(\d+)( businesses)?$/i.exec(last);
  const count = countMatch ? Number(countMatch[1]) : null;
  const body = countMatch ? parts.slice(0, -1) : parts;
  if (/^raw data$/i.test(body[0] || "")) return { title: "Raw Data", place: "", count };
  const keywords = (body[0] || "").split(",").map((k) => k.trim()).filter(Boolean);
  const first = keywords[0] && keywords[0] !== "scan" ? keywords[0][0].toUpperCase() + keywords[0].slice(1) : "Scan";
  return {
    title: keywords.length > 1 ? `${first} +${keywords.length - 1}` : first,
    place: body.slice(1).filter(Boolean).join(" · "),
    count,
  };
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const min = Math.round((now - t) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const running = (j: ScanJobLite) => j.status === "running" || j.status === "queued";

/** The last scans, newest first: tap one to put its businesses back on screen. */
export function RecentScans({
  scans,
  onOpen,
  openingId,
}: {
  scans: ScanJobLite[];
  onOpen: (id: string) => void;
  openingId?: string | null;
}) {
  const [all, setAll] = useState(false);
  if (!scans.length) return null;
  const shown = all ? scans : scans.slice(0, 5);
  return (
    <Panel>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <div className="text-xs font-semibold text-muted-foreground">Recent scans</div>
        <div className="text-[.68rem] text-muted-foreground">tap to reopen</div>
      </div>
      <ul className="-mx-2">
        {shown.map((j) => {
          const d = describeScan(j.label);
          const live = running(j);
          const pct = j.total ? Math.min(100, Math.round((j.cursor / j.total) * 100)) : 0;
          const state = live
            ? `Reading ${j.cursor} / ${j.total}`
            : j.status === "done"
              ? `${j.total} read`
              : j.status === "cancelled"
                ? `Stopped at ${j.cursor} / ${j.total}`
                : `Failed at ${j.cursor} / ${j.total}`;
          const Icon = live ? Loader2 : j.status === "done" ? CheckCircle2 : j.status === "cancelled" ? Ban : AlertTriangle;
          const iconCls = live
            ? "animate-spin text-primary"
            : j.status === "done"
              ? "text-[oklch(.6_.15_150)]"
              : j.status === "cancelled"
                ? "text-muted-foreground"
                : "text-destructive";
          return (
            <li key={j.id}>
              <button
                type="button"
                onClick={() => onOpen(j.id)}
                disabled={!!openingId}
                title={`${j.label}\n${state} · ${new Date(j.created_at).toLocaleString()}${j.last_error ? `\n${j.last_error}` : ""}`}
                className="flex min-h-11 w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait"
              >
                {openingId === j.id ? (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
                ) : (
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconCls}`} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium leading-5">
                    {d.title}
                    {d.place && <span className="font-normal text-muted-foreground"> · {d.place}</span>}
                  </span>
                  <span className="block truncate text-[.72rem] leading-4 text-muted-foreground tabular-nums">
                    {state} · {timeAgo(j.created_at)}
                  </span>
                  {live && (
                    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-secondary">
                      <span className="block h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {scans.length > 5 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-1 min-h-9 text-xs font-medium text-primary hover:underline"
        >
          {all ? "Show fewer" : `Show all ${scans.length}`}
        </button>
      )}
    </Panel>
  );
}
