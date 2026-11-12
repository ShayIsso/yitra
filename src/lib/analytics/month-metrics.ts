/**
 * Month metrics as the home screen shows them. Pure and dependency-free, like
 * `insights.ts`, so client components can import from this file directly; the
 * analytics index re-exports it but pulls the DB client into the bundle.
 */

/** A month figure against its comparison figure. */
export type MonthChange = {
  /** Current − previous, rounded to agorot. */
  amount: number;
  /** Relative to the size of the previous figure; null when a ratio would mislead. */
  percent: number | null;
};

/** Below this base a ratio is noise (₪20 → ₪900 is "+4,400%"), so the change is told in shekels. */
const MONTH_CHANGE_MIN_PERCENT_BASE = 200;
const MONTH_CHANGE_MAX_PERCENT = 1000;

export function monthChange(current: number, previous: number): MonthChange {
  const amount = Math.round((current - previous) * 100) / 100 || 0;
  if (amount === 0 || Math.abs(previous) < MONTH_CHANGE_MIN_PERCENT_BASE) {
    return { amount, percent: null };
  }
  const percent = (amount / Math.abs(previous)) * 100;
  return { amount, percent: Math.abs(percent) >= MONTH_CHANGE_MAX_PERCENT ? null : percent };
}

/**
 * Beyond ±100% a savings rate stops describing the month: spending more than
 * twice what came in (a sliver of interest against a normal month), or saving
 * more than came in (a net-refund month), is an artefact of the income base.
 */
const SAVINGS_RATE_COMPARABLE_LIMIT = 100;

/**
 * The savings rate (Net Savings / Total Income × 100, CLAUDE.md "Financial
 * Metrics") when it is a figure worth showing, else null — shown as "—".
 * Zero or negative income has no rate at all: never a 0% that reads as
 * "saved nothing" when there was nothing to save from.
 */
export function comparableSavingsRate(income: number, netSavings: number): number | null {
  if (income <= 0) return null;
  const rate = (netSavings / income) * 100;
  return Math.abs(rate) > SAVINGS_RATE_COMPARABLE_LIMIT ? null : rate;
}
