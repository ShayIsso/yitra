import {
  areQuietCategoriesVisible,
  comparableSavingsRate,
  computeMonthlySummary,
  computeSpendingByCategory,
  isMonthOverMonthChangeVisible,
  rollUpSpendingByGroup,
  type CategorySpendingNode,
  monthChange,
  monthPosition,
  previousMonth,
  toAgorot,
  MONTH_OVER_MONTH_VISIBLE_FROM_DAY,
  type InsightMonth,
  type MonthChange,
  type ReconciliationRole,
  type RollupCategory,
  type TransactionWithCategory,
} from "@/lib/analytics";
import type { TrendsReport } from "./trends";

export const HOME_TREND_MONTHS = 12;

/** A month row as the home trends read it: the totals shape plus its date. */
export type HomeTrendRow = TransactionWithCategory & {
  /** YYYY-MM-DD. */
  date: string;
  reconciliationRole: ReconciliationRole | null;
};

export type HomeTrendsInput = {
  month: InsightMonth;
  /** YYYY-MM-DD, the home calendar day. */
  today: string;
  /** The {@link HOME_TREND_MONTHS} months ending at {@link homeTrendWindowEnd}. */
  trend: TrendsReport;
  /** Every row of the selected month and of the month before it. */
  rows: { month: HomeTrendRow[]; previous: HomeTrendRow[] };
  categories: RollupCategory[];
};

export type HomeTrendTotals = {
  income: number;
  expenses: number;
  netSavings: number;
  investment: number;
  /** {@link comparableSavingsRate}: null is shown as "—". */
  savingsRate: number | null;
};

export type HomeTrendPoint = HomeTrendTotals & { year: number; month: number; hasData: boolean };

export type HomeTrendComparison =
  | {
      state: "shown";
      /**
       * A month still running is compared through today against the month
       * before through the same day; a closed month against the whole month.
       */
      basis: "month-to-date" | "whole-month";
      /** The day of the month both sides run through; null for whole months. */
      throughDay: number | null;
      previousMonth: InsightMonth;
      income: MonthChange;
      expenses: MonthChange;
      netSavings: MonthChange;
      investment: MonthChange;
      /** In percentage points; null when either month's rate is not a figure. */
      savingsRate: number | null;
    }
  /** The first days of a month mostly measure bank lag (`isMonthOverMonthChangeVisible`). */
  | { state: "early"; visibleFromDay: number }
  /** The month before holds no rows: nothing to compare with. */
  | { state: "no-history" };

/** One category of the ranked list: a group with its leaves, a root leaf, or a leaf in a group. */
export type HomeCategoryTrend = {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  /** The selected month's spend under the spend floor (a group: the sum of its floored leaves). */
  amount: number;
  /** Of the list's by-category sum (CONTEXT.md "spend floor": never Total Expenses). */
  share: number;
  /** Spend per month, aligned to `HomeTrends.months`. */
  series: (number | null)[];
  /** Over the comparison window; null while the comparison is not shown. */
  change: (MonthChange & { previous: number }) | null;
  /** Its leaves for a group, ranked; empty otherwise. */
  children: HomeCategoryTrend[];
};

/** A top-level category that spent last month and nothing (yet) in this one. */
export type QuietCategory = {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  /** Last month's whole spend. */
  previous: number;
};

export type HomeTrends = {
  month: InsightMonth;
  today: string;
  /** Oldest first. */
  months: HomeTrendPoint[];
  selectedIndex: number;
  totals: HomeTrendTotals;
  comparison: HomeTrendComparison;
  categories: { total: number; rows: HomeCategoryTrend[] };
  /** Empty until `areQuietCategoriesVisible`. */
  quiet: QuietCategory[];
};

const ordinal = (m: InsightMonth) => m.year * 12 + (m.month - 1);

/**
 * The last month of the home screen's twelve-month window: the current month
 * while the selected one falls inside the last twelve, so the chart holds
 * still as the owner taps through it, else the selected month itself.
 */
export function homeTrendWindowEnd(selected: InsightMonth, current: InsightMonth): InsightMonth {
  return ordinal(current) - ordinal(selected) < HOME_TREND_MONTHS ? current : selected;
}

function totalsOf(m: {
  income: number;
  expenses: number;
  netSavings: number;
  investment: number;
}): HomeTrendTotals {
  const income = toAgorot(m.income);
  const netSavings = toAgorot(m.netSavings);
  return {
    income,
    expenses: toAgorot(m.expenses),
    netSavings,
    investment: toAgorot(m.investment),
    savingsRate: comparableSavingsRate(income, netSavings),
  };
}

function summaryTotals(rows: readonly HomeTrendRow[]): HomeTrendTotals {
  const s = computeMonthlySummary([...rows]);
  return totalsOf({ ...s, investment: s.investmentTotal });
}

const dayOf = (row: HomeTrendRow) => Number(row.date.slice(8, 10));

/**
 * The comparison window: a running month through today against the month
 * before through the same day, as the insights compare (rows dated after
 * today are not spent yet); a closed month against the whole month before.
 */
function comparisonWindow(input: HomeTrendsInput) {
  const position = monthPosition(input.month, input.today);
  const throughDay = position.phase === "current" ? position.day : null;
  const upTo = (rows: readonly HomeTrendRow[]) =>
    throughDay === null ? [...rows] : rows.filter((r) => dayOf(r) <= throughDay);
  return { throughDay, month: upTo(input.rows.month), previous: upTo(input.rows.previous) };
}

function compareMonths(input: HomeTrendsInput): HomeTrendComparison {
  if (!isMonthOverMonthChangeVisible(input.month, input.today)) {
    return { state: "early", visibleFromDay: MONTH_OVER_MONTH_VISIBLE_FROM_DAY };
  }
  if (input.rows.previous.length === 0) return { state: "no-history" };
  const window = comparisonWindow(input);
  const current = summaryTotals(window.month);
  const previous = summaryTotals(window.previous);
  return {
    state: "shown",
    basis: window.throughDay === null ? "whole-month" : "month-to-date",
    throughDay: window.throughDay,
    previousMonth: previousMonth(input.month),
    income: monthChange(current.income, previous.income),
    expenses: monthChange(current.expenses, previous.expenses),
    netSavings: monthChange(current.netSavings, previous.netSavings),
    investment: monthChange(current.investment, previous.investment),
    savingsRate:
      current.savingsRate === null || previous.savingsRate === null
        ? null
        : current.savingsRate - previous.savingsRate,
  };
}

/** Group-first spend under the spend floor, the Dashboard breakdown's own composition. */
function spendNodes(
  rows: readonly HomeTrendRow[],
  categories: RollupCategory[],
): CategorySpendingNode[] {
  return rollUpSpendingByGroup(computeSpendingByCategory([...rows]), categories);
}

/** Every group's and leaf's amount by id. */
function amountsById(nodes: readonly CategorySpendingNode[]): Map<string, number> {
  const byId = new Map<string, number>();
  for (const n of nodes) {
    byId.set(n.categoryId, n.amount);
    for (const c of n.children) byId.set(c.categoryId, c.amount);
  }
  return byId;
}

/**
 * Per-category spend per month. A month with no rows at all (before the first
 * sync reached back that far) is unknown, not ₪0, so it is null and the
 * sparkline leaves a gap instead of plunging to zero.
 */
function knownSeries(trend: TrendsReport, amounts: number[]): (number | null)[] {
  return amounts.map((a, i) => (trend.months[i].hasData ? toAgorot(a) : null));
}

function seriesById(trend: TrendsReport): Map<string, (number | null)[]> {
  const byId = new Map<string, (number | null)[]>();
  for (const g of trend.breakdown) {
    for (const c of g.children) byId.set(c.categoryId, knownSeries(trend, c.amounts));
    byId.set(g.categoryId, knownSeries(trend, g.amounts));
  }
  return byId;
}

function rankCategories(input: HomeTrendsInput, compared: boolean, nodes: CategorySpendingNode[]) {
  const total = toAgorot(nodes.reduce((sum, n) => sum + n.amount, 0));
  const series = seriesById(input.trend);
  const window = compared ? comparisonWindow(input) : null;
  const current = window && amountsById(spendNodes(window.month, input.categories));
  const previous = window && amountsById(spendNodes(window.previous, input.categories));
  const empty = knownSeries(input.trend, new Array<number>(input.trend.months.length).fill(0));

  const trendOf = (n: CategorySpendingNode | Omit<CategorySpendingNode, "children">) => {
    const amount = toAgorot(n.amount);
    const before = previous?.get(n.categoryId) ?? 0;
    return {
      categoryId: n.categoryId,
      name: n.categoryName,
      color: n.color,
      icon: n.icon,
      amount,
      share: total > 0 ? amount / total : 0,
      series: series.get(n.categoryId) ?? empty,
      change: current
        ? { previous: before, ...monthChange(current.get(n.categoryId) ?? 0, before) }
        : null,
    };
  };

  const rows: HomeCategoryTrend[] = nodes.map((n) => ({
    ...trendOf(n),
    children: n.children.map((c) => ({ ...trendOf(c), children: [] })),
  }));
  return { total, rows };
}

function quietCategories(input: HomeTrendsInput, nodes: CategorySpendingNode[]): QuietCategory[] {
  if (!areQuietCategoriesVisible(input.month, input.today)) return [];
  const spent = new Set(nodes.map((n) => n.categoryId));
  return spendNodes(input.rows.previous, input.categories)
    .filter((n) => !spent.has(n.categoryId))
    .map((n) => ({
      categoryId: n.categoryId,
      name: n.categoryName,
      color: n.color,
      icon: n.icon,
      previous: toAgorot(n.amount),
    }));
}

/**
 * The home screen's trend sections for one month (#320): its totals against
 * the month before, the twelve-month series behind the sparklines and the
 * income-versus-expense chart. Every figure comes from the analytics module's
 * pure functions: month totals are true nets, per-category figures sit under
 * the spend floor, and the day-of-month gating is the insight rules'.
 */
export function buildHomeTrends(input: HomeTrendsInput): HomeTrends {
  const months = input.trend.months.map((p) => ({
    year: p.year,
    month: p.month,
    hasData: p.hasData,
    ...totalsOf(p),
  }));
  const selectedIndex = months.findIndex(
    (p) => p.year === input.month.year && p.month === input.month.month,
  );
  const { income, expenses, netSavings, investment, savingsRate } = months[selectedIndex];
  const comparison = compareMonths(input);
  const nodes = spendNodes(input.rows.month, input.categories);
  return {
    month: input.month,
    today: input.today,
    months,
    selectedIndex,
    totals: { income, expenses, netSavings, investment, savingsRate },
    comparison,
    categories: rankCategories(input, comparison.state === "shown", nodes),
    quiet: quietCategories(input, nodes),
  };
}
