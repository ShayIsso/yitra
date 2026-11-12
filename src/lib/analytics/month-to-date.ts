/**
 * Which rows of a month count as of today, and the window a month is compared
 * with the month before over. Pure and dependency-free like `insights.ts`; the
 * insights aggregate and the home trends share it, so their month-over-month
 * figures can never disagree on a window.
 */
import { monthPosition, type InsightMonth } from "./insights";

const dayOf = (row: { date: string }) => Number(row.date.slice(8, 10));

/**
 * Where `month` stands as of `today`, as the predicate a row of it (or of the
 * month before, over the same days) must pass to count; null before it starts.
 */
function cutoff(
  month: InsightMonth,
  today: string,
): {
  basis: MonthToDateBasis;
  counts: (row: { date: string }) => boolean;
} | null {
  const position = monthPosition(month, today);
  if (position.phase === "not-started") return null;
  if (position.phase === "closed") return { basis: "whole-month", counts: () => true };
  return { basis: "month-to-date", counts: (row) => dayOf(row) <= position.day };
}

/**
 * The rows of `month` that count as of `today`: a running month's through
 * today (a row the bank lists ahead, such as an installment, is not spent
 * yet), a closed month's all of them, a month not started none.
 */
export function countedThroughToday<R extends { date: string }>(
  month: InsightMonth,
  today: string,
  rows: readonly R[],
): R[] {
  const cut = cutoff(month, today);
  return cut ? rows.filter(cut.counts) : [];
}

/** A running month is compared through today, a closed month whole. */
export type MonthToDateBasis = "month-to-date" | "whole-month";

export type MonthToDateWindow<R> = {
  basis: MonthToDateBasis;
  /** The month's rows that count. */
  month: R[];
  /** The month before's rows over the same days. */
  previous: R[];
};

/**
 * A month against the month before over the same window: a running month
 * through today against the month before through the same day, since early
 * in a month a whole previous month would dwarf a few days of this one; a
 * closed month whole against the whole month before. Null for a month that
 * has not started. Rows are only windowed, never filtered otherwise: month
 * totals stay type-driven, and per-category figures drop flagged settlement
 * lumps on their own (`computeCategoryNetSpend`).
 */
export function monthToDateWindow<R extends { date: string }>(
  month: InsightMonth,
  today: string,
  rows: { month: readonly R[]; previous: readonly R[] },
): MonthToDateWindow<R> | null {
  const cut = cutoff(month, today);
  if (cut === null) return null;
  return {
    basis: cut.basis,
    month: rows.month.filter(cut.counts),
    previous: rows.previous.filter(cut.counts),
  };
}
