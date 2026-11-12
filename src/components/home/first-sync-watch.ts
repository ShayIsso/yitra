import type { OutlookResponse } from "./outlook-view";

/**
 * Watching a first sync this tab doesn't drive (another tab, the scheduler):
 * there is no stream here, so the home screen polls the cheap last-run-per-bank
 * read and re-reads the outlook only when that moves, and does the full
 * re-read once the run is over.
 */

function isFirstSyncRunning(o: OutlookResponse | null): boolean {
  return o?.state === "first-sync" && o.progress.running;
}

/** The outlook went from a running first sync to anything else: the run is over. */
export function firstSyncRunEnded(prev: OutlookResponse | null, next: OutlookResponse): boolean {
  return isFirstSyncRunning(prev) && !isFirstSyncRunning(next);
}

type RunLike = {
  bank: string;
  status: string;
  startedAt: string | Date;
  finishedAt: string | Date | null;
};

/** What a poll compares: a bank starting, finishing or failing a run changes it. */
export function runsSignature(runs: readonly RunLike[]): string {
  return runs
    .map((r) => `${r.bank}|${r.status}|${String(r.startedAt)}|${String(r.finishedAt)}`)
    .sort()
    .join(";");
}
