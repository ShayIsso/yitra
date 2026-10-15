"use server";

import { drizzleSyncRunStore } from "@/lib/sync/runs";
import { getLastRunsForCurrentInstitutions } from "@/lib/sync/current-runs";
import type { SyncRunSummary } from "@/lib/sync/runs";

export type { SyncRunSummary };

export async function getLastSyncRunsAction(): Promise<SyncRunSummary[]> {
  return getLastRunsForCurrentInstitutions(drizzleSyncRunStore);
}
