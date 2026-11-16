/**
 * A scan for online brands, run from the Ecom scanner: one search per request,
 * counted against the limit that was chosen, with the shops each search finds
 * read on the way (free). It can be stopped between any two searches, and what
 * was found so far is always kept. Nothing is ever messaged from here.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { type EcomBrand, type EcomSource, ecomBrandKeys, mergeEcomBrands } from "@/lib/ecom-brands";
import type { EcomStepResult } from "@/lib/ecom-scan";
import { type AdminData, authFetch } from "./store";
import { type EcomScanTally, ecomCursorsAfter, ecomScanSummary, trimEcomList } from "./ecom-board";

type Update = (fn: (prev: AdminData) => AdminData) => void;

export interface EcomScanOptions {
  /** A preset's name or anything typed. */
  niche: string;
  /** Country id ("" = anywhere). */
  market: string;
  sources: EcomSource[];
  /** The most searches this scan may use. */
  maxSearches: number;
  /** Only new: skip what an earlier scan returned. */
  hideSeen: boolean;
  /** Where each source's list of searches is picked up (0 = the first search). */
  startAt?: Partial<Record<EcomSource, number>>;
}

export type EcomStepReply = EcomStepResult & { warnings?: string[]; noProvider?: boolean };

export type EcomAsk =
  | { status: "ok"; data: EcomStepReply }
  /** Too many requests this minute: the same step is asked again after a wait. */
  | { status: "limited" }
  | { status: "failed"; message: string };

export interface EcomProgress {
  searches: number;
  max: number;
  /** New brands so far. */
  found: number;
  /** The search that ran last. */
  query: string;
}

/**
 * Why a scan ended: it used its searches ("done"), was stopped, found nothing
 * new several searches in a row ("dry"), ran every search there is ("plan"),
 * has no search key ("noProvider"), ran out of searches at the provider
 * ("noSearches"), or could not continue ("failed").
 */
export type EcomScanEnd =
  "done" | "stopped" | "dry" | "plan" | "noProvider" | "noSearches" | "failed";

export interface EcomScanOutcome {
  end: EcomScanEnd;
  tally: EcomScanTally;
  message: string;
  warnings: string[];
  /** Where each source it used now stands in its list of searches. */
  next: Partial<Record<EcomSource, number>>;
}

export interface EcomScanIo {
  ask: (body: Record<string, unknown>) => Promise<EcomAsk>;
  wait: (ms: number) => Promise<void>;
  stopped: () => boolean;
  /** The brands already in the list when the scan starts: never read again. */
  list: EcomBrand[];
  onBrands: (found: EcomBrand[]) => void;
  onProgress: (progress: EcomProgress) => void;
  now?: () => number;
}

/** Scan routes allow 30 requests a minute: one every 2.2 s stays under it. */
export const ECOM_GAP_MS = 2_200;
/**
 * Searches in a row, in one place, that add nothing before the scan stops
 * looking there: the rest would be paid for nothing. The other place carries
 * on, and the scan ends by itself when both have run dry.
 */
export const ECOM_DRY_LIMIT = 3;
const SOURCES: EcomSource[] = ["stores", "instagram"];
const SOURCE_NAME: Record<EcomSource, string> = { stores: "Online shops", instagram: "Instagram" };

export async function runEcomScan(o: EcomScanOptions, io: EcomScanIo): Promise<EcomScanOutcome> {
  const now = io.now ?? Date.now;
  const tally: EcomScanTally = {
    searches: 0,
    found: 0,
    withInstagram: 0,
    withEmail: 0,
    notBrands: 0,
    seen: 0,
    notShops: 0,
  };
  const warnings = new Set<string>();
  const sources = SOURCES.filter((s) => o.sources.includes(s));
  const startAt = (source: EcomSource) => {
    const at = o.startAt?.[source];
    return typeof at === "number" && Number.isInteger(at) && at > 0 ? at : 0;
  };
  const next: Record<EcomSource, number> = {
    stores: startAt("stores"),
    instagram: startAt("instagram"),
  };
  const outcome = (end: EcomScanEnd, message: string): EcomScanOutcome => ({
    end,
    tally,
    message,
    warnings: [...warnings],
    next: Object.fromEntries(sources.map((s) => [s, next[s]])),
  });
  if (!sources.length)
    return outcome("failed", "Choose where to look: online shops, Instagram, or both.");
  if (!o.niche.trim()) return outcome("failed", "Type what the brands sell.");

  const max = Math.max(1, Math.min(60, Math.floor(o.maxSearches) || 1));
  const since = new Date(now()).toISOString();
  const before = new Set(io.list.flatMap(ecomBrandKeys));
  let list = io.list.slice();
  const open = new Set<EcomSource>(sources);
  let turn = 0;
  const dry: Record<EcomSource, number> = { stores: 0, instagram: 0 };
  const driedUp: EcomSource[] = [];
  let busy = 0;
  let busyInAll = 0;
  let limited = 0;
  let dropped = 0;
  let lastAsk = -Infinity;
  let end: EcomScanEnd = "done";
  let problem = "";

  while (tally.searches < max) {
    if (io.stopped()) {
      end = "stopped";
      break;
    }
    const order = sources.filter((s) => open.has(s));
    if (!order.length) {
      end = driedUp.length ? "dry" : "plan";
      break;
    }
    const source = order[turn % order.length];
    const gap = lastAsk + ECOM_GAP_MS - now();
    if (gap > 0) await io.wait(gap);
    if (io.stopped()) {
      end = "stopped";
      break;
    }
    lastAsk = now();
    const reply = await io.ask({
      niche: o.niche,
      market: o.market,
      source,
      step: next[source],
      hideSeen: o.hideSeen,
      since,
      have: list.flatMap(ecomBrandKeys).slice(-800),
    });
    if (reply.status === "limited") {
      if (++limited > 4) {
        end = "failed";
        problem = "Too many requests right now. Wait a minute, then scan again.";
        break;
      }
      await io.wait(20_000);
      continue;
    }
    if (reply.status === "failed") {
      if (++dropped > 2) {
        end = "failed";
        problem = reply.message;
        break;
      }
      await io.wait(3_000);
      continue;
    }
    limited = 0;
    dropped = 0;
    const r = reply.data;
    (r.warnings ?? []).forEach((w) => warnings.add(w));
    if (r.noProvider) {
      end = "noProvider";
      break;
    }
    if (r.error) {
      end = "failed";
      problem = r.error;
      break;
    }
    if (r.retry) {
      // The provider was busy for a moment: the same search a few more times, then the next one.
      if (++busyInAll > 12) {
        end = "failed";
        problem =
          "The search provider keeps answering that it is busy. Try again in a few minutes.";
        break;
      }
      if (++busy > 3) {
        busy = 0;
        next[source]++;
        turn++;
      }
      await io.wait(3_000);
      continue;
    }
    busy = 0;
    if (r.stopped) {
      end = "noSearches";
      break;
    }
    next[source]++;
    turn++;
    tally.searches += r.searches;
    tally.notBrands += r.skipped?.notBrands ?? 0;
    tally.seen += r.skipped?.seen ?? 0;
    tally.notShops += r.skipped?.notShops ?? 0;
    if (r.done) open.delete(source);
    const merged = mergeEcomBrands(list, r.brands ?? []);
    list = merged.brands;
    tally.found += merged.added;
    if (r.brands?.length) io.onBrands(r.brands);
    io.onProgress({ searches: tally.searches, max, found: tally.found, query: r.query });
    // A step past the end of a plan ran no search: it says nothing about the niche.
    if (r.searches) dry[source] = merged.added ? 0 : dry[source] + 1;
    if (dry[source] >= ECOM_DRY_LIMIT && open.has(source)) {
      open.delete(source);
      driedUp.push(source);
    }
  }

  const fresh = list.filter((b) => !ecomBrandKeys(b).some((k) => before.has(k)));
  tally.found = fresh.length;
  tally.withInstagram = fresh.filter((b) => b.instagram).length;
  tally.withEmail = fresh.filter((b) => b.email).length;
  const summary = ecomScanSummary(
    tally,
    end === "stopped" || end === "dry" || end === "plan" ? end : "done",
  );
  if (end === "noProvider") return outcome(end, "");
  if (end === "noSearches")
    return outcome(
      end,
      `${summary} Your search provider has no searches left: top it up, or add a Brave Search key in Settings.`,
    );
  if (end === "failed")
    return outcome(end, `${problem} ${tally.found ? "What was found so far is kept." : ""}`.trim());
  // One place ran dry while the other carried on: say where the searches went.
  const left =
    end === "dry"
      ? ""
      : driedUp
          .map(
            (s) =>
              ` ${SOURCE_NAME[s]} was left after ${ECOM_DRY_LIMIT} searches that found nothing new.`,
          )
          .join("");
  return outcome(end, `${summary}${left}`);
}

/** One step, asked of the server as the signed-in admin. */
export async function askEcomStep(body: Record<string, unknown>): Promise<EcomAsk> {
  try {
    const res = await authFetch("/api/discover/ecom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(75_000),
    });
    if (res.status === 429) return { status: "limited" };
    if (res.status === 401 || res.status === 403)
      return {
        status: "failed",
        message: "You are signed out. Sign in again, then scan once more.",
      };
    if (!res.ok)
      return { status: "failed", message: `The scan could not continue (error ${res.status}).` };
    const data = (await res.json()) as EcomStepReply | null;
    if (!data || typeof data !== "object" || !Array.isArray(data.brands))
      return { status: "failed", message: "The scan got an answer it could not read." };
    return { status: "ok", data };
  } catch {
    return { status: "failed", message: "The connection dropped during a search." };
  }
}

export function useEcomScan(update: Update) {
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState<EcomProgress | null>(null);
  const [outcome, setOutcome] = useState<EcomScanOutcome | null>(null);
  const flag = useRef<{ stop: boolean; wake?: () => void } | null>(null);

  const run = useCallback(
    async (options: EcomScanOptions, list: EcomBrand[]) => {
      if (flag.current) return;
      const mine: { stop: boolean; wake?: () => void } = { stop: false };
      let attached = true;
      flag.current = mine;
      setBusy(true);
      setStopping(false);
      setOutcome(null);
      setProgress({ searches: 0, max: options.maxSearches, found: 0, query: "" });
      try {
        const result = await runEcomScan(options, {
          ask: askEcomStep,
          // A wait ends at once when the scan is stopped.
          wait: (ms) =>
            new Promise<void>((resolve) => {
              const done = () => {
                clearTimeout(timer);
                mine.wake = undefined;
                resolve();
              };
              const timer = setTimeout(done, ms);
              mine.wake = done;
            }),
          stopped: () => mine.stop,
          list,
          onBrands: (found) => {
            if (!attached || flag.current !== mine) return;
            update((prev) => ({
              ...prev,
              ecom: {
                ...prev.ecom,
                brands: trimEcomList(mergeEcomBrands(prev.ecom?.brands ?? [], found).brands),
                updatedAt: Date.now(),
              },
            }));
          },
          onProgress: setProgress,
        });
        if (flag.current !== mine) { attached = false; return; }
        setOutcome(result);
        // With "Only new", the next scan of this niche carries on after these searches.
        if (options.hideSeen && result.tally.searches > 0)
          update((prev) => ({
            ...prev,
            ecom: {
              brands: prev.ecom?.brands ?? [],
              cursors: ecomCursorsAfter(prev.ecom?.cursors, options, result.next),
              updatedAt: Date.now(),
            },
          }));
      } catch (error) {
        setOutcome({
          end: "failed",
          tally: {
            searches: 0,
            found: 0,
            withInstagram: 0,
            withEmail: 0,
            notBrands: 0,
            seen: 0,
            notShops: 0,
          },
          message: `The scan could not continue: ${(error as Error).message}. What was found so far is kept.`,
          warnings: [],
          next: {},
        });
      } finally {
        setBusy(false);
        setStopping(false);
        flag.current = null;
      }
    },
    [update],
  );

  // Signed out (the screen is gone): no further search is asked for.
  useEffect(
    () => () => {
      if (!flag.current) return;
      const current = flag.current;
      current.stop = true;
      current.wake?.();
      flag.current = null;
    },
    [],
  );

  /** Stops after the search that is running: its results are still added. */
  const stop = useCallback(() => {
    if (!flag.current) return;
    flag.current.stop = true;
    flag.current.wake?.();
    setStopping(true);
  }, []);

  return { busy, stopping, progress, outcome, run, stop, clearOutcome: () => setOutcome(null) };
}
