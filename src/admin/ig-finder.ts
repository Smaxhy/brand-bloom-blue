/**
 * "Find Instagram" for saved businesses: an Instagram-only run. The listing
 * and the website are read first (free); a search is spent only when those
 * have none, and never on a business searched in the last 30 days. No email
 * or website searches ride along, and nothing is ever messaged.
 */
import { useCallback, useRef, useState } from "react";
import {
  type AdminData,
  type EnrichResult,
  type RawBusiness,
  type ScanJobLite,
  cancelScan,
  scanStatus,
  startScan,
  stepScan,
} from "./store";
import { cleanIgUrl } from "./ig-board";
import { createRevealScanControl } from "./reveal-scan-control";
import { mergeRawReveal, rawScanPerson, runRawReveal } from "./raw-reveal";

type Update = (fn: (prev: AdminData) => AdminData) => void;

/** What a finished run tells the user, in one line. */
export function igFinderSummary(
  tally: { looked: number; found: number; searches: number; searchedFor: number },
  stopped = false,
): string {
  const { looked, found, searches, searchedFor } = tally;
  const head = found
    ? `Found ${found} Instagram account${found === 1 ? "" : "s"} for ${looked} business${looked === 1 ? "" : "es"}`
    : `No Instagram found for ${looked === 1 ? "this business" : `these ${looked} businesses`}`;
  const cost = searches
    ? `${searches} search${searches === 1 ? "" : "es"} used for ${searchedFor} of them`
    : "no search was used";
  return `${stopped ? "Stopped. " : ""}${head} · ${cost}.`;
}

export function useInstagramFinder(update: Update) {
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [job, setJob] = useState<ScanJobLite | null>(null);
  const [message, setMessage] = useState("");
  const control = useRef<ReturnType<typeof createRevealScanControl> | null>(null);

  const run = useCallback(
    async (rows: RawBusiness[]) => {
      if (control.current || !rows.length) return;
      const mine = createRevealScanControl();
      control.current = mine;
      setBusy(true);
      setProgress({ done: 0, total: rows.length });
      setMessage("");
      // The same business can come back more than once (each step, then the final read): the last word counts.
      const seen = new Map<string, { found: boolean; searches: number }>();
      const apply = (results: EnrichResult[]) => {
        const byId = new Map<string, EnrichResult>();
        for (const result of results) {
          if (!result.id) continue;
          byId.set(result.id, result);
          seen.set(result.id, {
            found: !!cleanIgUrl(result.instagram),
            searches: result.instagramSearches ?? 0,
          });
        }
        if (!byId.size) return;
        const now = Date.now();
        update((prev) => ({
          ...prev,
          raw: prev.raw.map((row) => {
            const result = byId.get(row.id);
            return result ? mergeRawReveal(row, result, now) : row;
          }),
        }));
      };
      const tally = () => {
        const all = [...seen.values()];
        return {
          looked: rows.length,
          found: all.filter((x) => x.found).length,
          searches: all.reduce((sum, x) => sum + x.searches, 0),
          searchedFor: all.filter((x) => x.searches > 0).length,
        };
      };
      try {
        const warnings = await runRawReveal(rows.map(rawScanPerson), {
          start: (people) =>
            startScan(
              people,
              {
                useClaude: false,
                usePaid: false,
                revealPhone: false,
                findLinkedin: false,
                findInstagram: true,
                instagramOnly: true,
              },
              `Instagram · ${people.length} business${people.length === 1 ? "" : "es"}`,
              mine.canContinue,
            ),
          step: (id) => stepScan(id, mine.canContinue),
          status: (id) => scanStatus(id, true),
          canContinue: mine.canContinue,
          wait: () => new Promise((resolve) => setTimeout(resolve, 2000)),
          onJob: setJob,
          onRows: apply,
          onProgress: (done, total) => setProgress({ done, total }),
        });
        const finished = await mine.canContinue();
        setMessage([igFinderSummary(tally(), !finished), ...warnings].join(" · "));
      } catch (error) {
        setMessage(
          `The search could not continue: ${(error as Error).message}. What was found so far is saved.`,
        );
      } finally {
        setBusy(false);
        setJob(null);
        control.current = null;
      }
    },
    [update],
  );

  const stop = useCallback(async () => {
    if (!job || stopping || !control.current) return;
    setStopping(true);
    try {
      await control.current.stop(() => cancelScan(job.id));
    } catch (error) {
      setMessage(`Could not stop: ${(error as Error).message}`);
    } finally {
      setStopping(false);
    }
  }, [job, stopping]);

  return {
    busy,
    stopping,
    progress,
    message,
    canStop: !!job,
    run,
    stop,
    clearMessage: () => setMessage(""),
  };
}
