import { israelCalendarDay } from "@/lib/calendar";

/**
 * The home screen's month: which calendar month it shows and how the owner
 * moves between months. The month lives in the URL as `/?month=YYYY-MM`
 * (bare `/` is the current month), so reload, back/forward, the command
 * palette and the 12-month chart all address a month the same way.
 */
export type HomeMonth = { year: number; month: number };

const ordinal = (m: HomeMonth): number => m.year * 12 + (m.month - 1);

const fromOrdinal = (index: number): HomeMonth => ({
  year: Math.floor(index / 12),
  month: (index % 12) + 1,
});

export function compareMonths(a: HomeMonth, b: HomeMonth): number {
  return ordinal(a) - ordinal(b);
}

export function sameMonth(a: HomeMonth, b: HomeMonth): boolean {
  return compareMonths(a, b) === 0;
}

export function shiftMonth(m: HomeMonth, delta: number): HomeMonth {
  return fromOrdinal(ordinal(m) + delta);
}

export const HOME_MONTH_PARAM = "month";

export function monthParam(m: HomeMonth): string {
  return `${m.year}-${String(m.month).padStart(2, "0")}`;
}

/**
 * The month a `?month=` value names, or `current` when it names none or one
 * that hasn't started: the outlook has nothing to say about a future month.
 */
export function parseMonthParam(value: string | null, current: HomeMonth): HomeMonth {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return current;
  const parsed = { year: Number(match[1]), month: Number(match[2]) };
  if (parsed.month < 1 || parsed.month > 12) return current;
  return compareMonths(parsed, current) > 0 ? current : parsed;
}

export function homeHref(m: HomeMonth, current: HomeMonth): string {
  return sameMonth(m, current) ? "/" : `/?${HOME_MONTH_PARAM}=${monthParam(m)}`;
}

/** The current month on the home calendar day (CONTEXT.md "home calendar day"). */
export function homeMonthOf(now: Date): HomeMonth {
  const [year, month] = israelCalendarDay(now).split("-").map(Number);
  return { year, month };
}

/** Five, not six: at 360px six segments shrink below a 44px tap target. */
export const MONTH_WINDOW = 5;

/**
 * The segmented control's months, oldest first. In RTL that puts the newest
 * at the inline end (left), the same direction as the chevrons and the swipe.
 */
export function monthWindow(selected: HomeMonth, current: HomeMonth): HomeMonth[] {
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

export const HEBREW_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
] as const;

export const HEBREW_MONTHS_SHORT = [
  "ינו׳",
  "פבר׳",
  "מרץ",
  "אפר׳",
  "מאי",
  "יוני",
  "יולי",
  "אוג׳",
  "ספט׳",
  "אוק׳",
  "נוב׳",
  "דצמ׳",
] as const;

export function monthName(m: HomeMonth): string {
  return HEBREW_MONTHS[m.month - 1];
}
