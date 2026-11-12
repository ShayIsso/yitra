/**
 * Calendar-day helpers for the transactions page. A transaction's `date` is a
 * calendar date (`YYYY-MM-DD`, no time zone): it is read with local getters,
 * never through `new Date(string)`, which would parse it as UTC midnight and
 * show the previous day west of Greenwich.
 */

/** Consecutive rows sharing a date, in the listing's (date-descending) order. */
export function groupByDay<T extends { date: string }>(rows: T[]): { day: string; rows: T[] }[] {
  const groups: { day: string; rows: T[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last?.day === row.date) last.rows.push(row);
    else groups.push({ day: row.date, rows: [row] });
  }
  return groups;
}

export function toLocalDate(day: string): Date {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function localIso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const SHORT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});
const SAME_YEAR = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const LONG = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function shortDay(day: string): string {
  return SHORT.format(toLocalDate(day));
}

export function longDay(day: string): string {
  return LONG.format(toLocalDate(day));
}

/** A feed day heading: today, yesterday, else the weekday and date (year only when not this year). */
export function dayLabel(day: string, today: Date): string {
  if (day === localIso(today)) return "היום";
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (day === localIso(yesterday)) return "אתמול";
  const date = toLocalDate(day);
  return (date.getFullYear() === today.getFullYear() ? SAME_YEAR : LONG).format(date);
}
