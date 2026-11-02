export const dynamic = "force-dynamic";

import { listCredentials } from "@/lib/credentials";
import { SyncPanel } from "@/components/sync-panel";
import {
  getLastRunPerBank,
  drizzleSyncRunStore,
  getInstitutionsWithRecordedSuccess,
} from "@/lib/sync/runs";
import { runsOfCurrentInstitutions } from "@/lib/sync/current-runs";

/**
 * Deliberately no streaming skeleton (route `loading.tsx` or in-page
 * Suspense): with either, the post-sync `router.refresh()` raced the shell's
 * Link prefetches and left the pending-reconciliation badge stale in 4 of 10
 * headless runs on the production build, against 0 of 8 without (#324).
 */
export default async function SyncPage() {
  // Persisted fallback for SyncPanel's live SSE state (#223) — the same
  // per-bank read the dashboard's SyncFreshnessPill already uses, so a
  // failure or otp_skipped run survives a reload instead of only living in
  // this tab's in-memory SSE state.
  const [credentials, allRuns, observedInstitutions] = await Promise.all([
    listCredentials(),
    getLastRunPerBank(drizzleSyncRunStore),
    getInstitutionsWithRecordedSuccess(drizzleSyncRunStore),
  ]);
  const lastRuns = runsOfCurrentInstitutions(
    allRuns,
    credentials.map((credential) => credential.bankType),
  );
  return (
    <SyncPanel
      banks={credentials}
      lastRuns={lastRuns}
      observedInstitutions={observedInstitutions}
    />
  );
}
