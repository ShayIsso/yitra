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

function localIso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const sameYear = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const otherYear = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * A feed day heading. `day` is a calendar date (`YYYY-MM-DD`, no time zone),
 * so it is compared with `today`'s local calendar date, never through UTC.
 */
export function dayLabel(day: string, today: Date): string {
  if (day === localIso(today)) return "היום";
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (day === localIso(yesterday)) return "אתמול";
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return (y === today.getFullYear() ? sameYear : otherYear).format(date);
}
