/**
 * How long ago a sync ran, in the buckets every sync surface shares (the Sync
 * page's per-bank rows, the home hero's freshness indicator). Takes `ageMs`,
 * never a `Date`, so a caller can't reintroduce a clock read in the render
 * path (bug #193). Dependency-free: it ships in the home route's first load.
 */
export function formatRelativeAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / (60 * 1000));
  if (minutes < 1) return "לפני פחות מדקה";
  if (minutes < 60) return `לפני ${minutes} דקות`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "אתמול";
  return `לפני ${days} ימים`;
}
