import { isBankType } from "@/lib/bank-registry";
import { getLastRunPerBank, type SyncRunStore, type SyncRunSummary } from "./runs";

/**
 * Freshness is about institutions the app still syncs. `sync_runs` keeps the
 * history of a deleted credential, so the filter sits here at read time —
 * never a delete — and a stored id the registry no longer knows is excluded
 * too, since the sync loop never attempts it (ADR-0013 §4) and no run can
 * ever clear its verdict.
 */
export function runsOfCurrentInstitutions(
  runs: readonly SyncRunSummary[],
  credentialBankTypes: readonly string[],
): SyncRunSummary[] {
  const current = new Set<string>(credentialBankTypes.filter(isBankType));
  return runs.filter((run) => current.has(run.bank));
}

async function listCredentialBankTypes(): Promise<string[]> {
  const { listCredentials } = await import("@/lib/credentials");
  const credentials = await listCredentials();
  return credentials.map((credential) => credential.bankType);
}

export async function getLastRunsForCurrentInstitutions(
  store: SyncRunStore,
  listBankTypes: () => Promise<readonly string[]> = listCredentialBankTypes,
): Promise<SyncRunSummary[]> {
  const [runs, bankTypes] = await Promise.all([getLastRunPerBank(store), listBankTypes()]);
  return runsOfCurrentInstitutions(runs, bankTypes);
}
