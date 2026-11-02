/**
 * Gathers `monthOutlook`'s inputs behind a store (ADR-0007) and calls the pure
 * core. Rows are read one calendar month at a time through analytics' single
 * month query, the window every Dashboard and budget figure uses, so the
 * outlook's spend agrees with them.
 */
import { monthDateRange } from "@/lib/analytics";
import {
  projectSeries,
  type DetectionTransaction,
  type PersistedRecurringPattern,
} from "@/lib/recurring-detection";
import type { SyncRunSummary } from "@/lib/sync/runs";
import { merchantKey, sameMerchant } from "@/lib/transaction-matching";
import {
  monthOutlook,
  outlookMonthExpenses,
  spendRowIds,
  type MonthOutlook,
  type OutlookRecurringCharge,
  type OutlookRow,
  type PriorMonthExpenses,
} from "./outlook";
import type { YearMonth } from "./pace";

/** Prior months read for the usual month; it averages at most the latest three complete ones. */
const HISTORY_MONTHS = 12;

export type MonthOutlookStore = {
  /** Every transaction dated in the calendar month. */
  loadMonth(month: YearMonth): Promise<OutlookRow[]>;
  /** Each bank account's earliest stored transaction (YYYY-MM-DD), with its credential. */
  accountHistoryStarts(): Promise<{ credentialId: string; earliest: string }[]>;
  expenseTarget(): Promise<number | null>;
  /** Non-canceled series and the money-out evidence that judges their liveness (ADR-0012). */
  recurring(): Promise<{
    patterns: PersistedRecurringPattern[];
    transactions: DetectionTransaction[];
  }>;
  /** Institution id of every connected credential. */
  credentialBankTypes(): Promise<string[]>;
  /** The latest run per institution, any status. */
  lastRunPerBank(): Promise<SyncRunSummary[]>;
  /** Per institution, when its latest run that finished successfully finished. */
  lastRecordedSuccessPerBank(): Promise<{ bank: string; finishedAt: Date }[]>;
  /** When the install's first successful run finished, or null when none has. */
  firstRecordedSuccessAt(): Promise<Date | null>;
  /** When the in-progress sync run began, or null when none is running. */
  syncRunningSince(): Promise<Date | null>;
};

export type OutlookClock = {
  /** YYYY-MM-DD. */
  today: string;
  now: Date;
};

function addMonths(month: YearMonth, delta: number): YearMonth {
  const index = month.year * 12 + (month.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * Each live, active series' charge for the month. Its latest charge has
 * arrived only when that row is in the month up to today AND counts as spend
 * — an uncategorized posting adds nothing to spent, so it stays due (awaiting
 * a category, not late) rather than vanishing from both. A charge the bank
 * lists later in the month is due on that date; any other is due on its
 * projected date, which may be in the past (late but live).
 */
function recurringCharges(
  patterns: PersistedRecurringPattern[],
  transactions: DetectionTransaction[],
  monthRows: OutlookRow[],
  month: YearMonth,
  today: string,
): OutlookRecurringCharge[] {
  const { from, to } = monthDateRange(month.year, month.month);
  const spendIds = spendRowIds(monthRows);
  // Rows the bank already lists for later months (installments) would make a
  // series' latest charge next month's and hide this month's from both spent
  // and due, so evidence stops at the month's end.
  const evidence = transactions.filter((t) => t.date <= to);
  const projections = projectSeries(patterns, evidence, new Date(`${today}T00:00:00.000Z`));
  const charges: OutlookRecurringCharge[] = [];

  patterns.forEach((pattern, i) => {
    const { isLive, evidence: seen } = projections[i];
    if (pattern.status !== "active" || !isLive || !seen) return;

    const lastCharge = seen.lastObservedChargeDate.toISOString().slice(0, 10);
    const inMonth = lastCharge >= from && lastCharge <= to;
    const lastChargeIsSpend = evidence.some(
      (t) =>
        t.date === lastCharge &&
        spendIds.has(t.id) &&
        sameMerchant(merchantKey(t.description), pattern.merchant),
    );
    const posted = inMonth && lastCharge <= today;
    charges.push({
      id: pattern.id,
      amount: seen.observedAmount,
      expectedDate: inMonth ? lastCharge : seen.projectedDate.toISOString().slice(0, 10),
      arrived: posted && lastChargeIsSpend,
      awaitingCategory: posted && !lastChargeIsSpend,
      cadence: pattern.cadence,
    });
  });
  return charges;
}

/**
 * From when every connected credential's history is present: each credential
 * reaches back to its earliest transaction on any of its accounts, and the
 * install to the latest of those. Per credential, not per account: a
 * replacement card under the same login starts a new account without leaving
 * a gap, while a newly connected credential does leave one until a full month
 * of it is stored.
 */
function historyCompleteSince(
  accountStarts: { credentialId: string; earliest: string }[],
): string | null {
  const credentialStart = new Map<string, string>();
  for (const { credentialId, earliest } of accountStarts) {
    const known = credentialStart.get(credentialId);
    if (known === undefined || earliest < known) credentialStart.set(credentialId, earliest);
  }
  let latest: string | null = null;
  for (const start of credentialStart.values()) {
    if (latest === null || start > latest) latest = start;
  }
  return latest;
}

/**
 * When the data is complete up to: the OLDEST of the connected institutions'
 * latest successful syncs, the same worst-case reading the freshness pill
 * takes — one freshly synced bank must not hide another's old data. Null
 * throughout the first run (no success predates it), so the home screen keeps
 * showing that run's progress instead of one bank's partial month.
 */
function lastSuccessfulSyncAt(
  successes: { bank: string; finishedAt: Date }[],
  credentialBankTypes: string[],
  firstSuccess: Date | null,
  runningSince: Date | null,
): Date | null {
  if (firstSuccess === null) return null;
  if (runningSince !== null && firstSuccess.getTime() >= runningSince.getTime()) return null;
  const current = new Set(credentialBankTypes);
  const times = successes.filter((s) => current.has(s.bank)).map((s) => s.finishedAt.getTime());
  return times.length === 0 ? null : new Date(Math.min(...times));
}

/**
 * Connected credentials whose institution's run finished during the current
 * sync — same unit as `banksTotal` (credentials). A run left over from an
 * earlier attempt started before the current one and is not progress.
 */
function credentialsDone(
  credentialBankTypes: string[],
  lastRuns: SyncRunSummary[],
  runningSince: Date | null,
): number {
  if (runningSince === null) return 0;
  const finishedNow = new Set(
    lastRuns
      .filter((r) => r.finishedAt !== null && r.startedAt.getTime() >= runningSince.getTime())
      .map((r) => r.bank),
  );
  return credentialBankTypes.filter((bank) => finishedNow.has(bank)).length;
}

export async function getMonthOutlookWithStore(
  month: YearMonth,
  clock: OutlookClock,
  store: MonthOutlookStore,
): Promise<MonthOutlook> {
  const priorMonths = Array.from({ length: HISTORY_MONTHS }, (_, i) => addMonths(month, -(i + 1)));
  const [
    monthRows,
    priorRows,
    accountStarts,
    target,
    recurring,
    bankTypes,
    lastRuns,
    successes,
    firstSuccess,
    runningSince,
  ] = await Promise.all([
    store.loadMonth(month),
    Promise.all(priorMonths.map((m) => store.loadMonth(m))),
    store.accountHistoryStarts(),
    store.expenseTarget(),
    store.recurring(),
    store.credentialBankTypes(),
    store.lastRunPerBank(),
    store.lastRecordedSuccessPerBank(),
    store.firstRecordedSuccessAt(),
    store.syncRunningSince(),
  ]);

  const history: PriorMonthExpenses[] = priorMonths.map((prior, i) => ({
    month: prior,
    expenses: outlookMonthExpenses(priorRows[i], prior),
  }));

  return monthOutlook({
    month,
    today: clock.today,
    now: clock.now,
    target,
    rows: monthRows,
    recurring: recurringCharges(
      recurring.patterns,
      recurring.transactions,
      monthRows,
      month,
      clock.today,
    ),
    history,
    historyCompleteSince: historyCompleteSince(accountStarts),
    lastSuccessfulSyncAt: lastSuccessfulSyncAt(successes, bankTypes, firstSuccess, runningSince),
    credentialCount: bankTypes.length,
    sync: {
      running: runningSince !== null,
      banksDone: credentialsDone(bankTypes, lastRuns, runningSince),
    },
  });
}
