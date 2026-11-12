/**
 * Sync staleness for the month outlook (#312 "stale = last successful sync
 * older than 2 days"). Dependency-free on purpose: the home screen's client
 * re-applies it on its clock tick, and the budgets index pulls the DB.
 */
export const STALE_SYNC_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

/** Whether a sync `ageMs` old leaves the outlook stale. */
export function isSyncStale(ageMs: number): boolean {
  return ageMs > STALE_SYNC_AFTER_MS;
}
