import {
  areQuietCategoriesVisible,
  comparableSavingsRate,
  computeMonthlySummary,
  countedThroughToday,
  isMonthOverMonthChangeVisible,
  monthChange,
  monthDateRange,
  monthIndex,
  monthToDateWindow,
  previousMonth,
  toAgorot,
  rollUpCategorySpend,
  windowCategorySpend,
  MONTH_OVER_MONTH_VISIBLE_FROM_DAY,
  type CategorySpendingNode,
  type InsightMonth,
  type MonthChange,
  type MonthToDateWindow,
  type RollupCategory,
  type TransactionWithCategory,
} from "@/lib/analytics";
import {
  isComparisonHistoryComplete,
  type AccountHistoryStart,
} from "@/lib/analytics/history-coverage";
import { buildTrendsReport, enumerateMonthRange, type TrendsReport } from "./trends";

const HOME_TREND_MONTHS = 12;

/** A row as the home trends read it: the totals shape plus its date. */
export type HomeTrendRow = TransactionWithCategory & {
  /** YYYY-MM-DD. */
  date: string;
};

export type HomeTrendsInput = {
  month: InsightMonth;
  /** YYYY-MM-DD, the home calendar day. */
  today: string;
  /** Every row in {@link homeTrendRange} for `month` and `today`. */
  rows: HomeTrendRow[];
  categories: RollupCategory[];
  /** Each account's earliest stored row, the month outlook's coverage read. */
  historyStarts: AccountHistoryStart[];
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
  /**
   * History covers only part of one of the two months (the first sync reached
   * back into it mid-month), so a change would measure the sync's edge.
   */
  | { state: "incomplete-history" }
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
  /** Spend per month, aligned to `HomeTrends.months`; null for a month with no rows at all. */
  series: (number | null)[];
  /**
   * Against the month before; null while the comparison is not shown.
   * `previous` is over the same window as the change (month-to-date for a
   * running month); `previousWhole` is the whole month before, which decides
   * whether the category is new.
   */
  change: (MonthChange & { previous: number; previousWhole: number }) | null;
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
  /** Empty until `areQuietCategoriesVisible`, and while the comparison is unknown. */
  quiet: QuietCategory[];
};

const monthOf = (isoDate: string): InsightMonth => ({
  year: Number(isoDate.slice(0, 4)),
  month: Number(isoDate.slice(5, 7)),
});

/**
 * The last month of the home screen's twelve-month window: the current month
 * while the selected one falls inside the last twelve, so the chart holds
 * still as the owner taps through it, else the selected month itself.
 */
export function homeTrendWindowEnd(selected: InsightMonth, current: InsightMonth): InsightMonth {
  return monthIndex(current) - monthIndex(selected) < HOME_TREND_MONTHS ? current : selected;
}

function windowMonths(selected: InsightMonth, today: string): InsightMonth[] {
  const end = homeTrendWindowEnd(selected, monthOf(today));
  return enumerateMonthRange(monthDateRange(end.year, end.month).from, HOME_TREND_MONTHS);
}

/**
 * The dates {@link buildHomeTrends} needs rows for: the twelve-month window,
 * and the month before the selected one when the selected month opens it.
 */
export function homeTrendRange(
  selected: InsightMonth,
  today: string,
): { from: string; to: string } {
  const months = windowMonths(selected, today);
  const before = previousMonth(selected);
  const first = monthIndex(before) < monthIndex(months[0]) ? before : months[0];
  const last = months[months.length - 1];
  return {
    from: monthDateRange(first.year, first.month).from,
    to: monthDateRange(last.year, last.month).to,
  };
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

function rowsByMonth(rows: readonly HomeTrendRow[]): (m: InsightMonth) => HomeTrendRow[] {
  const byIndex = new Map<number, HomeTrendRow[]>();
  for (const r of rows) {
    const index = monthIndex(monthOf(r.date));
    const list = byIndex.get(index);
    if (list) list.push(r);
    else byIndex.set(index, [r]);
  }
  return (m) => byIndex.get(monthIndex(m)) ?? [];
}

function isComparable(input: HomeTrendsInput): boolean {
  return isComparisonHistoryComplete(previousMonth(input.month), input.month, input.historyStarts);
}

function monthOverMonth(
  input: HomeTrendsInput,
  window: MonthToDateWindow<HomeTrendRow>,
  current: HomeTrendTotals,
  previousMonthHasRows: boolean,
): HomeTrendComparison {
  if (!isMonthOverMonthChangeVisible(input.month, input.today)) {
    return { state: "early", visibleFromDay: MONTH_OVER_MONTH_VISIBLE_FROM_DAY };
  }
  if (!previousMonthHasRows) return { state: "no-history" };
  if (!isComparable(input)) return { state: "incomplete-history" };
  const previous = summaryTotals(window.previous);
  return {
    state: "shown",
    basis: window.basis,
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
 * sync reached back that far, or a running month whose rows are all dated
 * ahead) is unknown, not ₪0, so it is null and the sparkline breaks there.
 */
function seriesById(trend: TrendsReport): Map<string, (number | null)[]> {
  const known = (amounts: number[]) =>
    amounts.map((a, i) => (trend.months[i].hasData ? toAgorot(a) : null));
  const byId = new Map<string, (number | null)[]>();
  for (const g of trend.breakdown) {
    for (const c of g.children) byId.set(c.categoryId, known(c.amounts));
    byId.set(g.categoryId, known(g.amounts));
  }
  return byId;
}

function rankCategories(
  trend: TrendsReport,
  spend: { month: CategorySpendingNode[]; previous: CategorySpendingNode[] },
  previousWhole: (() => CategorySpendingNode[]) | null,
) {
  const nodes = spend.month;
  const total = toAgorot(nodes.reduce((sum, n) => sum + n.amount, 0));
  const series = seriesById(trend);
  const previous = previousWhole && amountsById(spend.previous);
  const whole = previousWhole && amountsById(previousWhole());

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
      series: series.get(n.categoryId) ?? trend.months.map(() => null),
      change:
        previous && whole
          ? {
              previous: before,
              previousWhole: whole.get(n.categoryId) ?? 0,
              ...monthChange(amount, before),
            }
          : null,
    };
  };

  const rows: HomeCategoryTrend[] = nodes.map((n) => ({
    ...trendOf(n),
    children: n.children.map((c) => ({ ...trendOf(c), children: [] })),
  }));
  return { total, rows };
}

function quietCategories(
  input: HomeTrendsInput,
  comparison: HomeTrendComparison,
  spent: CategorySpendingNode[],
  previousWhole: () => CategorySpendingNode[],
): QuietCategory[] {
  if (!areQuietCategoriesVisible(input.month, input.today)) return [];
  if (comparison.state === "incomplete-history" || comparison.state === "no-history") return [];
  const spentIds = new Set(spent.map((n) => n.categoryId));
  return previousWhole()
    .filter((n) => !spentIds.has(n.categoryId))
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
 * income-versus-expense chart. The trends report's own pure core builds the
 * series, and the month-to-date window and category comparison are the ones
 * the insights use, so month totals are true nets, per-category figures sit
 * under the spend floor without flagged settlement lumps, and the day-of-month
 * gating is the insight rules'. The running month counts its rows through
 * today wherever it appears ({@link countedThroughToday}), so its point is the
 * same whichever month is selected. The caller must not ask for a month that
 * has not started.
 */
export function buildHomeTrends(input: HomeTrendsInput): HomeTrends {
  const { month, today, categories } = input;
  const rowsOf = rowsByMonth(input.rows);
  const months = windowMonths(month, today);
  const trend = buildTrendsReport(
    months.map((m) => ({ ...m, transactions: countedThroughToday(m, today, rowsOf(m)) })),
    categories,
  );
  const selectedIndex = months.findIndex((m) => monthIndex(m) === monthIndex(month));
  const points = trend.months.map((p) => ({
    year: p.year,
    month: p.month,
    hasData: p.hasData,
    ...totalsOf(p),
  }));
  const totals = totalsOf(trend.months[selectedIndex]);

  const previousRows = rowsOf(previousMonth(month));
  const window = monthToDateWindow(month, today, { month: rowsOf(month), previous: previousRows });
  if (window === null) throw new RangeError("home trends: the month has not started");
  const comparison = monthOverMonth(input, window, totals, previousRows.length > 0);
  const spend = windowCategorySpend(window, categories);
  // The whole month before: the comparison's own when it compares whole months.
  let whole: CategorySpendingNode[] | null = window.basis === "whole-month" ? spend.previous : null;
  const previousWhole = () => (whole ??= rollUpCategorySpend(previousRows, categories));

  return {
    month,
    today,
    months: points,
    selectedIndex,
    totals,
    comparison,
    categories: rankCategories(trend, spend, comparison.state === "shown" ? previousWhole : null),
    quiet: quietCategories(input, comparison, spend.month, previousWhole),
  };
}
