/**
 * Home-screen date formatting. Client-only callers (hydration rule, CLAUDE.md).
 */

/** An unpadded "day.month" for a `YYYY-MM-DD` date ("9.8"), the short form card dates use. */
export function formatDayMonth(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${day}.${month}`;
}
