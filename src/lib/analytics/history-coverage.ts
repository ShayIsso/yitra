/**
 * How far back the stored history reaches, per credential (#328): the month
 * outlook's notion, shared with the home trends. Dependency-free, so pure
 * cores on either side import it without the DB stores.
 */
import { monthDateRange } from "./month-window";

type Month = { year: number; month: number };

/** A bank account's earliest stored transaction (YYYY-MM-DD), with its credential. */
export type AccountHistoryStart = { credentialId: string; earliest: string };

/**
 * Each credential's history begins at its earliest transaction on any of its
 * accounts. Per credential, not per account: a replacement card under the same
 * login starts a new account without leaving a gap.
 */
function credentialStarts(accountStarts: readonly AccountHistoryStart[]): string[] {
  const start = new Map<string, string>();
  for (const { credentialId, earliest } of accountStarts) {
    const known = start.get(credentialId);
    if (known === undefined || earliest < known) start.set(credentialId, earliest);
  }
  return [...start.values()];
}

/**
 * From when every connected credential's history is present: the latest of
 * the credentials' starts. A newly connected credential leaves a gap until a
 * full month of it is stored. Null before anything is stored.
 */
export function historyCompleteSince(accountStarts: readonly AccountHistoryStart[]): string | null {
  let latest: string | null = null;
  for (const start of credentialStarts(accountStarts)) {
    if (latest === null || start > latest) latest = start;
  }
  return latest;
}

/**
 * Whether every connected credential's history covers all of `month`, from its
 * first day. A month the first sync reached only part of is not a month to
 * average or compare.
 */
export function isMonthHistoryComplete(month: Month, since: string | null): boolean {
  return since !== null && since <= monthDateRange(month.year, month.month).from;
}

/**
 * Whether two months can be compared, credential by credential on the same
 * starts: no credential's history may begin inside them, where the first
 * sync may have reached it only part-way (a mid-month edge reads as a drop).
 * A credential whose history begins after both months has no rows in either,
 * so it cannot skew the comparison and does not hold it back. `through`
 * (YYYY-MM-DD) is the last day the comparison counts: today for a running
 * month, whose rows dated ahead do not count yet; `later`'s last day otherwise.
 */
export function isComparisonHistoryComplete(
  earlier: Month,
  later: Month,
  accountStarts: readonly AccountHistoryStart[],
  through: string = monthDateRange(later.year, later.month).to,
): boolean {
  const from = monthDateRange(earlier.year, earlier.month).from;
  const to = through;
  return credentialStarts(accountStarts).every((start) => start <= from || start > to);
}
