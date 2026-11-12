/**
 * The month window every analytics/report calculation uses: a calendar month on
 * `transactions.date`, as inclusive ISO `YYYY-MM-DD` bounds. Dependency-free (no
 * DB imports) so it is the single owner shared by the analytics DB wrappers, the
 * reports store, and client code (the CSV href builder) alike — one definition,
 * zero copies. Divergence here would silently break the "reports totals agree
 * with the Dashboard" invariant (issue #168), so it lives in exactly one place.
 */
export function monthDateRange(year: number, month: number): { from: string; to: string } {
  const mm = String(month).padStart(2, "0");
  const from = `${year}-${mm}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

/** A calendar month as a count of months, so month arithmetic is integer arithmetic. */
export function monthIndex({ year, month }: { year: number; month: number }): number {
  return year * 12 + (month - 1);
}

export function monthAtIndex(index: number): { year: number; month: number } {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
