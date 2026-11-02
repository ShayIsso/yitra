/**
 * The process's one sync claim (CONTEXT.md "sync claim"), apart from the sync
 * barrel so a reader such as the month outlook can ask whether a run is in
 * progress without loading the scraper.
 */
import { createSyncClaim, type SyncClaim } from "./claim";

// One in-progress sync at a time, across every entry point that can launch
// one — the SSE route and the scheduler (#246) — and never alongside a
// categorization backfill (#263), which writes the same uncategorized rows.
// Without this, two syncs could both set the sync module's OTP handler and race
// to resolve each other's OTP.
//
// Keyed off `globalThis`, not a bare module-level `const` — Next.js bundles
// the instrumentation hook (src/instrumentation.ts → the scheduler) into a
// separate chunk from the App Router route handlers, so `createSyncClaim()`
// called at plain module scope would run once per bundle and produce two
// independent claims that can never see each other, silently reopening the
// exact scheduler/manual overlap this guard exists to close. `globalThis` is
// shared across every bundle in the process, so this is a true singleton.
const GLOBAL_CLAIM_KEY = "__yitraSyncClaim" as const;
const globalForSyncClaim = globalThis as typeof globalThis & {
  [GLOBAL_CLAIM_KEY]?: SyncClaim;
};

export const syncClaim: SyncClaim = (globalForSyncClaim[GLOBAL_CLAIM_KEY] ??= createSyncClaim());

/**
 * When the sync claim was taken, or null while free. The categorization
 * backfill holds the same claim, so this is "a run is in progress", not
 * necessarily a bank sync.
 */
export function syncClaimHeldSince(): Date | null {
  return syncClaim.heldSince();
}
