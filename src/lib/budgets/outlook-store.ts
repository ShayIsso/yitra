/**
 * The month outlook's DB-backed wrapper: gathers `monthOutlook`'s inputs behind
 * a store (ADR-0007) and calls the pure core. Rows are read on
 * `transactions.date` through analytics' `monthDateRange`, the window every
 * Dashboard and budget figure uses, so the outlook's spend agrees with them.
 */
import { and, eq, gte, lte, min } from "drizzle-orm";
import { db } from "@/db";
import {
  bankAccounts,
  bankCredentials,
  categories,
  monthlyTargets,
  transactions,
} from "@/db/schema";
import { monthDateRange } from "@/lib/analytics";
import {
  drizzleRecurringStore,
  projectSeries,
  type DetectionTransaction,
  type PersistedRecurringPattern,
} from "@/lib/recurring-detection";
import { runsOfCurrentInstitutions } from "@/lib/sync/current-runs";
import {
  drizzleSyncRunStore,
  getLastRecordedSuccessPerBank,
  getLastRunPerBank,
  type SyncRunSummary,
} from "@/lib/sync/runs";
import { pendingWithCompletedTwin } from "@/lib/transactions";
import {
  monthOutlook,
  outlookMonthExpenses,
  type MonthOutlook,
  type OutlookRecurringCharge,
  type OutlookRow,
  type PriorMonthExpenses,
} from "./outlook";
import type { YearMonth } from "./pace";

/** Prior months read for the usual month; it averages at most the latest three complete ones. */
const HISTORY_MONTHS = 12;

export type MonthOutlookStore = {
  /** Every transaction dated in [from, to], inclusive YYYY-MM-DD. */
  loadRows(from: string, to: string): Promise<OutlookRow[]>;
  /** YYYY-MM-DD of the earliest stored transaction, or null when there are none. */
  earliestTransactionDate(): Promise<string | null>;
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
  isSyncRunning(): Promise<boolean>;
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
 * Each live, active series' charge for the month. One whose latest charge is
 * already in the month up to today has arrived; one listed later in the month
 * is still due on that date; any other is due on its projected date, which may
 * be in the past (late but live).
 */
function recurringCharges(
  patterns: PersistedRecurringPattern[],
  transactions: DetectionTransaction[],
  month: YearMonth,
  today: string,
): OutlookRecurringCharge[] {
  const { from, to } = monthDateRange(month.year, month.month);
  const projections = projectSeries(patterns, transactions, new Date(`${today}T00:00:00.000Z`));
  const charges: OutlookRecurringCharge[] = [];

  patterns.forEach((pattern, i) => {
    const { isLive, evidence } = projections[i];
    if (pattern.status !== "active" || !isLive || !evidence) return;

    const lastCharge = evidence.lastObservedChargeDate.toISOString().slice(0, 10);
    const inMonth = lastCharge >= from && lastCharge <= to;
    charges.push({
      id: pattern.id,
      amount: evidence.observedAmount,
      expectedDate: inMonth ? lastCharge : evidence.projectedDate.toISOString().slice(0, 10),
      arrived: inMonth && lastCharge <= today,
    });
  });
  return charges;
}

/**
 * When the data is complete up to: the OLDEST of the connected institutions'
 * latest successful syncs, the same worst-case reading the freshness pill
 * takes — one freshly synced bank must not hide another's old data.
 */
function lastSuccessfulSyncAt(
  successes: { bank: string; finishedAt: Date }[],
  credentialBankTypes: string[],
): Date | null {
  const current = new Set(credentialBankTypes);
  const times = successes.filter((s) => current.has(s.bank)).map((s) => s.finishedAt.getTime());
  return times.length === 0 ? null : new Date(Math.min(...times));
}

export async function getMonthOutlookWithStore(
  month: YearMonth,
  clock: OutlookClock,
  store: MonthOutlookStore,
): Promise<MonthOutlook> {
  const historyStart = addMonths(month, -HISTORY_MONTHS);
  const [rows, dataSince, target, recurring, bankTypes, lastRuns, successes, running] =
    await Promise.all([
      store.loadRows(
        monthDateRange(historyStart.year, historyStart.month).from,
        monthDateRange(month.year, month.month).to,
      ),
      store.earliestTransactionDate(),
      store.expenseTarget(),
      store.recurring(),
      store.credentialBankTypes(),
      store.lastRunPerBank(),
      store.lastRecordedSuccessPerBank(),
      store.isSyncRunning(),
    ]);

  // Twins pair across the whole read, not per month: a pending row on the 31st
  // whose posted version is dated the 1st must not count in both months.
  const superseded = pendingWithCompletedTwin(rows);
  const rowsByMonth = new Map<string, OutlookRow[]>();
  for (const row of rows) {
    if (superseded.has(row.id)) continue;
    const key = row.date.slice(0, 7);
    const bucket = rowsByMonth.get(key);
    if (bucket) bucket.push(row);
    else rowsByMonth.set(key, [row]);
  }
  const rowsOf = (m: YearMonth) =>
    rowsByMonth.get(`${m.year}-${String(m.month).padStart(2, "0")}`) ?? [];

  const history: PriorMonthExpenses[] = [];
  for (let back = 1; back <= HISTORY_MONTHS; back++) {
    const prior = addMonths(month, -back);
    history.push({ month: prior, expenses: outlookMonthExpenses(rowsOf(prior), prior) });
  }

  return monthOutlook({
    month,
    today: clock.today,
    now: clock.now,
    target,
    rows: rowsOf(month),
    recurring: recurringCharges(recurring.patterns, recurring.transactions, month, clock.today),
    history,
    dataSince,
    lastSuccessfulSyncAt: lastSuccessfulSyncAt(successes, bankTypes),
    credentialCount: bankTypes.length,
    sync: {
      running,
      banksDone: runsOfCurrentInstitutions(lastRuns, bankTypes).filter((r) => r.finishedAt !== null)
        .length,
    },
  });
}

export const drizzleMonthOutlookStore: MonthOutlookStore = {
  async loadRows(from, to) {
    const rows = await db
      .select({
        id: transactions.id,
        bankAccountId: transactions.bankAccountId,
        bankType: bankCredentials.bankType,
        date: transactions.date,
        description: transactions.description,
        chargedAmount: transactions.chargedAmount,
        status: transactions.status,
        categoryType: categories.type,
      })
      .from(transactions)
      .innerJoin(bankAccounts, eq(transactions.bankAccountId, bankAccounts.id))
      .innerJoin(bankCredentials, eq(bankAccounts.credentialId, bankCredentials.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(gte(transactions.date, from), lte(transactions.date, to)));

    return rows.map((r) => ({
      ...r,
      chargedAmount: Number(r.chargedAmount),
      categoryType: r.categoryType ?? null,
    }));
  },

  async earliestTransactionDate() {
    const [row] = await db.select({ earliest: min(transactions.date) }).from(transactions);
    return row?.earliest ?? null;
  },

  async expenseTarget() {
    const [row] = await db
      .select({ expenseTarget: monthlyTargets.expenseTarget })
      .from(monthlyTargets)
      .where(eq(monthlyTargets.id, 1));
    return row?.expenseTarget != null ? Number(row.expenseTarget) : null;
  },

  async recurring() {
    const [patterns, txns] = await Promise.all([
      drizzleRecurringStore.getPersistedPatterns(),
      drizzleRecurringStore.getTransactionsForDetection(),
    ]);
    return { patterns, transactions: txns };
  },

  async credentialBankTypes() {
    const rows = await db.select({ bankType: bankCredentials.bankType }).from(bankCredentials);
    return rows.map((r) => r.bankType);
  },

  lastRunPerBank() {
    return getLastRunPerBank(drizzleSyncRunStore);
  },

  lastRecordedSuccessPerBank() {
    return getLastRecordedSuccessPerBank();
  },

  async isSyncRunning() {
    // Lazy: the sync barrel pulls in the scraper, which no budgets read needs loaded.
    const { isSyncClaimHeld } = await import("@/lib/sync");
    return isSyncClaimHeld();
  },
};
