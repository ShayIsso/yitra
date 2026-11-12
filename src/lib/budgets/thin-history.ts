/**
 * History is thin below this many complete prior months with expense data: no
 * "usual month", no suggested target, no projection. A month counts as
 * complete only when stored data reaches back to its first day — a partial
 * month would understate the usual month.
 *
 * Dependency-free on purpose, like `staleness.ts`: the home screen's client
 * states the threshold in its explanation, and the budgets index pulls the DB.
 */
export const THIN_HISTORY_MIN_FULL_MONTHS = 1;
