/**
 * The home screen's calendar day (CONTEXT.md "home calendar day"): the date in
 * Israel, where the owner and the banks are. Pure and dependency-free so route
 * handlers and pure cores share it. A UTC day would still be yesterday for the
 * first two or three hours of each local day, and on the 1st would refuse the
 * month that just began.
 */
const israelDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD of `now` in Asia/Jerusalem. */
export function israelCalendarDay(now: Date): string {
  return israelDay.format(now);
}
