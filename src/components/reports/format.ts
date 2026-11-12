/**
 * Reports-page formatting. Client-only callers (hydration rule, CLAUDE.md).
 *
 * Signed figures go through `Intl.NumberFormat("he-IL")`, which prefixes the
 * sign with a left-to-right mark: in an RTL paragraph a bare "-12%" would
 * resolve its sign as RTL and draw it on the number's right ("12%-"). The mark
 * anchors it to the left, where Hebrew financial text reads it.
 */

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
];

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
];

export type YearMonth = { year: number; month: number };

export function monthKey(m: YearMonth): string {
  return `${m.year}-${String(m.month).padStart(2, "0")}`;
}

/** The reports page opened on one month's report (`/reports?month=YYYY-MM`). */
export function reportsMonthHref(m: YearMonth): string {
  return `/reports?month=${monthKey(m)}`;
}

/**
 * The month key a `/reports?month=` value names, or null when it is absent or
 * malformed, in which case the page opens on its default month.
 */
export function parseReportMonthParam(value: string | null): string | null {
  return value !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
}

export function monthLabel(m: YearMonth): string {
  return `${HEBREW_MONTHS[m.month - 1]} ${m.year}`;
}

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatILS(amount: number): string {
  // `|| 0` folds -0 (a month whose refunds exactly cancel) into a plain zero.
  return ILS.format(Math.round(amount) || 0);
}

// Investment is net deployment (CONTEXT.md "net outflow"): negative means more
// came back from investment accounts than went in, so it is named a net
// withdrawal rather than left to read as a deposit.
export function formatInvestment(amount: number): string {
  return Math.round(amount) < 0 ? `${formatILS(amount)} (משיכה נטו)` : formatILS(amount);
}

const SIGNED_PERCENT = new Intl.NumberFormat("he-IL", {
  style: "percent",
  signDisplay: "exceptZero",
  maximumFractionDigits: 0,
});

/** A relative change in percent units (12 → "+12%"), sign anchored for RTL. */
export function formatSignedPercent(pct: number): string {
  return SIGNED_PERCENT.format(Math.round(pct) / 100 || 0);
}

const SIGNED_INTEGER = new Intl.NumberFormat("he-IL", {
  signDisplay: "exceptZero",
  maximumFractionDigits: 0,
});

const SIGNED_ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  signDisplay: "exceptZero",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** A change in whole shekels (−880 → "-880 ₪"), sign anchored for RTL. */
export function formatSignedILS(amount: number): string {
  return SIGNED_ILS.format(Math.round(amount) || 0);
}

/** A change in percentage points (savings rate), sign anchored for RTL. */
export function formatPointsDelta(points: number): string {
  return `${SIGNED_INTEGER.format(Math.round(points) || 0)} נק׳`;
}

const PERCENT = new Intl.NumberFormat("he-IL", { style: "percent", maximumFractionDigits: 0 });

/** A level in percent units (savings rate 23 → "23%"); a negative keeps its anchored minus. */
export function formatPercent(value: number): string {
  return PERCENT.format(Math.round(value) / 100 || 0);
}

const COMPACT = new Intl.NumberFormat("he-IL", { notation: "compact", maximumFractionDigits: 1 });

/** Axis tick: compact, no currency symbol (the axis carries "₪"). */
export function formatAxisTick(value: number): string {
  return COMPACT.format(value || 0);
}
