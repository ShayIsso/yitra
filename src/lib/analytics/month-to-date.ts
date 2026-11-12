/**
 * Which rows of a month count as of today, and the window a month is compared
 * with the month before over. Pure and dependency-free like `insights.ts`; the
 * insights aggregate and the home trends share it, so their month-over-month
 * figures can never disagree on a window.
 */
import { monthPosition, type InsightMonth } from "./insights";

const dayOf = (row: { date: string }) => Number(row.date.slice(8, 10));

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
  const position = monthPosition(month, today);
  if (position.phase === "not-started") return [];
  if (position.phase === "closed") return [...rows];
  return rows.filter((r) => dayOf(r) <= position.day);
}

export type MonthToDateWindow<R> = {
  basis: "month-to-date" | "whole-month";
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
  const position = monthPosition(month, today);
  if (position.phase === "not-started") return null;
  if (position.phase === "closed") {
    return { basis: "whole-month", month: [...rows.month], previous: [...rows.previous] };
  }
  const upTo = (list: readonly R[]) => list.filter((r) => dayOf(r) <= position.day);
  return { basis: "month-to-date", month: upTo(rows.month), previous: upTo(rows.previous) };
}
