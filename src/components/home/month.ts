import { HEBREW_MONTHS, monthKey, type YearMonth } from "@/components/reports/format";
import { monthAtIndex, monthIndex } from "@/lib/analytics/month-window";
import { OUTLOOK_FIRST_YEAR } from "@/lib/budgets/outlook-range";
import { israelCalendarDay } from "@/lib/calendar";

/**
 * The home screen's month: which calendar month it shows and how the owner
 * moves between months. The month lives in the URL as `/?month=YYYY-MM`
 * (bare `/` is the current month), so reload, back/forward, the command
 * palette and the 12-month chart all address a month the same way.
 */
export type HomeMonth = YearMonth;

export function compareMonths(a: HomeMonth, b: HomeMonth): number {
  return monthIndex(a) - monthIndex(b);
}

export function sameMonth(a: HomeMonth, b: HomeMonth): boolean {
  return compareMonths(a, b) === 0;
}

export function shiftMonth(m: HomeMonth, delta: number): HomeMonth {
  return monthAtIndex(monthIndex(m) + delta);
}

export const HOME_MONTH_PARAM = "month";

/**
 * The months the home screen can show: from the first month with data (or
 * the outlook route's own floor when nothing dates it) to the current month.
 * The outlook has nothing to say about a month that hasn't started.
 */
export type MonthRange = { first: HomeMonth; current: HomeMonth };

/**
 * The browsable range given the months that hold data: from the oldest of
 * them, or the outlook route's own floor when there is none. Rows the bank
 * lists ahead (installments) never put the floor past the current month.
 */
export function homeMonthRange(
  monthsWithData: readonly HomeMonth[],
  current: HomeMonth,
): MonthRange {
  if (monthsWithData.length === 0) {
    return { first: { year: OUTLOOK_FIRST_YEAR, month: 1 }, current };
  }
  const oldest = monthsWithData.reduce((a, b) => (compareMonths(b, a) < 0 ? b : a));
  const first = compareMonths(oldest, current) > 0 ? current : oldest;
  return { first: { year: first.year, month: first.month }, current };
}

export function isBrowsable(m: HomeMonth, { first, current }: MonthRange): boolean {
  return compareMonths(m, first) >= 0 && compareMonths(m, current) <= 0;
}

/**
 * The month a `?month=` value names, clamped into `range`; the current month
 * when it names none.
 */
export function parseMonthParam(value: string | null, range: MonthRange): HomeMonth {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return range.current;
  const parsed = { year: Number(match[1]), month: Number(match[2]) };
  if (parsed.month < 1 || parsed.month > 12) return range.current;
  if (compareMonths(parsed, range.current) > 0) return range.current;
  return compareMonths(parsed, range.first) < 0 ? range.first : parsed;
}

export function homeHref(m: HomeMonth, current: HomeMonth): string {
  return sameMonth(m, current) ? "/" : `/?${HOME_MONTH_PARAM}=${monthKey(m)}`;
}

/** The current month on the home calendar day (CONTEXT.md "home calendar day"). */
export function homeMonthOf(now: Date): HomeMonth {
  const [year, month] = israelCalendarDay(now).split("-").map(Number);
  return { year, month };
}

/** Five, not six: at 360px six segments shrink below a 44px tap target. */
const MONTH_WINDOW = 5;

/**
 * The segmented control's months, oldest first. In RTL that puts the newest
 * at the inline end (left), the same direction as the chevrons and the swipe.
 */
export function monthWindow(selected: HomeMonth, { current }: MonthRange): HomeMonth[] {
  const behind = compareMonths(current, selected);
  const newest =
    behind < MONTH_WINDOW ? current : shiftMonth(selected, Math.floor(MONTH_WINDOW / 2));
  return Array.from({ length: MONTH_WINDOW }, (_, i) => shiftMonth(newest, i - (MONTH_WINDOW - 1)));
}

const SWIPE_MIN_PX = 56;

/**
 * The month step a horizontal swipe asks for: +1 (later), −1 (earlier) or 0.
 * In an RTL pager later months sit to the left, so dragging the finger
 * rightwards pulls the later month in. A drag must be clearly horizontal, or
 * it is the page scrolling.
 */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx > 0 ? 1 : -1;
}

export function monthName(m: HomeMonth): string {
  return HEBREW_MONTHS[m.month - 1];
}
