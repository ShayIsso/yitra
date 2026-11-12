import { israelCalendarDay } from "@/lib/calendar";
import type { SyncRunStatus } from "@/lib/sync/runs";

/**
 * How current the home screen's figures are, decided once for the hero's
 * freshness indicator. Staleness is the month outlook's own verdict (its
 * `STALE_SYNC_AFTER_MS` against the oldest institution's last success), so
 * the indicator and the "as of" line can never disagree; failures and missed
 * codes come from each current institution's last recorded run
 * (`/api/sync-runs`); a run this tab is driving outranks both.
 */
export type FreshnessInput = {
  /** Last run per current institution. */
  runs: readonly { bank: string; status: SyncRunStatus }[];
  /** ISO instant of the outlook's last successful sync; null when there is none. */
  asOf: string | null;
  stale: boolean;
  /** Null until the client has read its clock (bug #193: no clock in the SSR path). */
  nowMs: number | null;
  live: { syncing: boolean; codeBank: string | null };
};

export type Freshness =
  | { kind: "code-needed"; bank: string }
  | { kind: "syncing" }
  | { kind: "failed"; bank: string }
  | { kind: "code-missed"; bank: string }
  | { kind: "stale"; ageMs: number | null }
  | { kind: "fresh"; ageMs: number | null }
  | { kind: "unknown" };

export function homeFreshness({ runs, asOf, stale, nowMs, live }: FreshnessInput): Freshness {
  if (live.codeBank !== null) return { kind: "code-needed", bank: live.codeBank };
  if (live.syncing) return { kind: "syncing" };

  const failed = runs.find((run) => run.status === "error");
  if (failed) return { kind: "failed", bank: failed.bank };
  const missed = runs.find((run) => run.status === "otp_skipped");
  if (missed) return { kind: "code-missed", bank: missed.bank };

  if (asOf === null) return { kind: "unknown" };
  const ageMs = nowMs === null ? null : nowMs - Date.parse(asOf);
  return stale ? { kind: "stale", ageMs } : { kind: "fresh", ageMs };
}

const israelTime = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const israelDate = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  day: "numeric",
  month: "long",
});

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When the figures were synced, on the home calendar day: "היום 08:05",
 * "אתמול 10:00" or "8 בנובמבר". Client-only, like all date formatting.
 */
export function syncDayLabel(iso: string, nowMs: number): string {
  const at = new Date(iso);
  const day = israelCalendarDay(at);
  if (day === israelCalendarDay(new Date(nowMs))) return `היום ${israelTime.format(at)}`;
  if (day === israelCalendarDay(new Date(nowMs - DAY_MS))) return `אתמול ${israelTime.format(at)}`;
  return israelDate.format(at);
}

/** Same buckets and wording as the Sync page's per-bank age. */
export function relativeAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "לפני פחות מדקה";
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "אתמול" : `לפני ${days} ימים`;
}
