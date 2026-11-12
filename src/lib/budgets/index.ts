/**
 * Public interface of the budgets module (CONTEXT.md "budget pace"; decision
 * record #105). Budgets are gauges, not allocations: an optional monthly cap per
 * expense-type category, measured as subtree spend for one calendar month and
 * reset every month (contrast goals, which accumulate). The DB-backed wrappers
 * compose the pure pace core with the same calendar-month transaction window
 * analytics uses, so budget numbers always agree with the Dashboard.
 */
import { db } from "@/db";
import { categories, monthlyTargets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getMonthlySummary, getMonthTransactionDetails } from "@/lib/analytics";
import {
  createBudgetWithStore,
  updateBudgetWithStore,
  deleteBudgetWithStore,
  drizzleBudgetStore,
  type BudgetChanges,
  type BudgetWriteData,
  type StoredBudget,
} from "./store";
import {
  computeCategorySpend,
  computeSubtreeSpend,
  evaluateBudget,
  monthElapsed,
  isMonthClosed,
  classifySavingsTarget,
  evaluateExpenseTargetPace,
  type BudgetPace,
  type SavingsTargetVerdict,
  type YearMonth,
} from "./pace";
import { israelCalendarDay } from "@/lib/calendar";
import type { MonthOutlook } from "./outlook";
import { getMonthOutlookWithStore } from "./outlook-store";
import { makeDrizzleMonthOutlookStore, readAccountHistoryStarts } from "./outlook-drizzle-store";

export { DuplicateBudgetCategoryError, NonExpenseBudgetCategoryError } from "./errors";
export type { StoredBudget, BudgetWriteData, BudgetChanges, BudgetStore } from "./store";
export {
  monthElapsed,
  isMonthClosed,
  classifyBudget,
  evaluateBudget,
  computeSubtreeSpend,
  computeCategorySpend,
  classifySavingsTarget,
  monthNetSavings,
  evaluateExpenseTargetPace,
  WARN_MARGIN,
  REASSURE_MARGIN,
  MUTE_THROUGH_DAY,
  type BudgetVerdict,
  type BudgetPace,
  type MonthElapsed,
  type SavingsTargetVerdict,
  type YearMonth,
} from "./pace";

export {
  monthOutlook,
  hasOutlookMonthStarted,
  STALE_SYNC_AFTER_MS,
  THIN_HISTORY_MIN_FULL_MONTHS,
  type MonthOutlook,
  type MonthOutlookInput,
  type OutlookRow,
} from "./outlook";
export {
  getMonthOutlookWithStore,
  type MonthOutlookStore,
  type OutlookClock,
} from "./outlook-store";

export type BudgetStatus = {
  budget: StoredBudget;
  /** Subtree spend for the month (self + direct children over the one-level tree). */
  pace: BudgetPace;
};

export type MonthlyTargetsData = {
  expenseTarget: number | null;
  savingsTarget: number | null;
};

export type SavingsTargetStatus = {
  target: number;
  netSavings: number;
  monthClosed: boolean;
  /** Null intra-month: the savings target is evaluated at month close only in V1. */
  verdict: SavingsTargetVerdict | null;
};

export async function createBudget(data: BudgetWriteData): Promise<string> {
  return createBudgetWithStore(data, drizzleBudgetStore);
}

export async function updateBudget(id: string, changes: BudgetChanges): Promise<void> {
  await updateBudgetWithStore(id, changes, drizzleBudgetStore);
}

export async function deleteBudget(id: string): Promise<void> {
  await deleteBudgetWithStore(id, drizzleBudgetStore);
}

export async function listBudgets(): Promise<StoredBudget[]> {
  return drizzleBudgetStore.listBudgets();
}

/**
 * The budget on a category, if any. BGR8's category delete-confirm dialog calls
 * this to warn that deleting the category will cascade-delete its budget (schema
 * `ON DELETE CASCADE`); nothing else needs a detach story.
 */
export async function getBudgetForCategory(categoryId: string): Promise<StoredBudget | null> {
  return drizzleBudgetStore.getByCategoryId(categoryId);
}

// Budget pace still takes the UTC day; the home screen's aggregates use the
// Israel day (CONTEXT.md "home calendar day"). Callers that need the two to
// agree pass `today` explicitly.
const isoToday = (): string => new Date().toISOString().slice(0, 10);

/**
 * The month outlook for `month`, as of the last successful sync (#312), on the
 * home calendar day. The caller must not ask for a month that hasn't started
 * there (`monthOutlook` throws a RangeError).
 */
export async function getMonthOutlook(year: number, month: number): Promise<MonthOutlook> {
  const now = new Date();
  return getMonthOutlookWithStore(
    { year, month },
    { today: israelCalendarDay(now), now },
    makeDrizzleMonthOutlookStore(async () => (await getMonthlyTargets()).expenseTarget),
  );
}

/** The month outlook's coverage read, for other readers of history coverage. */
export const getAccountHistoryStarts = readAccountHistoryStarts;

/**
 * Pace verdict for every budget in `month`. Each budget evaluates independently
 * over its subtree (parent and child budgets coexist with no precedence law).
 * `today` is threaded to the pure core; it defaults to the real date but is a
 * parameter so callers and tests stay deterministic.
 */
export async function getBudgetStatuses(
  year: number,
  month: number,
  today: string = isoToday(),
): Promise<BudgetStatus[]> {
  const budgetRows = await drizzleBudgetStore.listBudgets();
  if (budgetRows.length === 0) return [];

  const ym: YearMonth = { year, month };
  const [txns, categoryRows] = await Promise.all([
    getMonthTransactionDetails(year, month),
    db.select({ id: categories.id, parentId: categories.parentId }).from(categories),
  ]);

  const spend = computeCategorySpend(txns);
  const elapsed = monthElapsed(ym, today);

  return budgetRows.map((budget) => {
    const subtreeSpend = computeSubtreeSpend(budget.categoryId, categoryRows, spend);
    return { budget, pace: evaluateBudget(budget.monthlyLimit, subtreeSpend, elapsed) };
  });
}

export async function getMonthlyTargets(): Promise<MonthlyTargetsData> {
  const [row] = await db
    .select({
      expenseTarget: monthlyTargets.expenseTarget,
      savingsTarget: monthlyTargets.savingsTarget,
    })
    .from(monthlyTargets)
    .where(eq(monthlyTargets.id, 1));

  return {
    expenseTarget: row?.expenseTarget != null ? Number(row.expenseTarget) : null,
    savingsTarget: row?.savingsTarget != null ? Number(row.savingsTarget) : null,
  };
}

/** Upserts the single monthly-targets row (id=1 — mirrors `scheduler_config`). */
export async function setMonthlyTargets(data: MonthlyTargetsData): Promise<void> {
  const values = {
    expenseTarget: data.expenseTarget != null ? String(data.expenseTarget) : null,
    savingsTarget: data.savingsTarget != null ? String(data.savingsTarget) : null,
  };
  await db
    .insert(monthlyTargets)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({
      target: monthlyTargets.id,
      set: { ...values, updatedAt: new Date() },
    });
}

/**
 * The month's savings-target status against Net Savings. Returns null when no
 * savings target is set. The verdict is `met`/`missed` only once the month is
 * closed (`today` past its last day) — intra-month savings pacing is deferred to
 * a later slice (decision record #105 §6).
 */
export async function getSavingsTargetStatus(
  year: number,
  month: number,
  today: string = isoToday(),
): Promise<SavingsTargetStatus | null> {
  const { savingsTarget } = await getMonthlyTargets();
  if (savingsTarget == null) return null;

  const ym: YearMonth = { year, month };
  const { netSavings } = await getMonthlySummary(year, month);
  const monthClosed = isMonthClosed(ym, today);

  return {
    target: savingsTarget,
    netSavings,
    monthClosed,
    verdict: monthClosed ? classifySavingsTarget(savingsTarget, netSavings) : null,
  };
}

/**
 * Pace verdict for the overall monthly expense target against the month's
 * total expense spend (CONTEXT.md "monthly targets" — the Dashboard's
 * pace-hero composite, issue #198). Reuses the same `evaluateBudget` core and
 * `monthElapsed` tick as a per-category budget; `limit` on the returned pace
 * is the target itself, so there's no separate "target" field to thread.
 * Returns null when no expense target is set.
 */
export async function getExpenseTargetPace(
  year: number,
  month: number,
  today: string = isoToday(),
): Promise<BudgetPace | null> {
  const { expenseTarget } = await getMonthlyTargets();

  const ym: YearMonth = { year, month };
  const { expenses: monthExpenses } = await getMonthlySummary(year, month);
  const elapsed = monthElapsed(ym, today);

  return evaluateExpenseTargetPace(expenseTarget, monthExpenses, elapsed);
}
