export type PendingSweepStore = {
  /** Ids of the account's `pending` rows dated on or after `fromDate`. */
  findPendingIds(bankAccountId: string, fromDate: string): Promise<string[]>;
  /** Deletes the rows and resolves every reference to them so nothing dangles. */
  deleteTransactions(ids: string[]): Promise<void>;
};

/**
 * Deletes the account's pending rows inside the scrape window that this scrape
 * did not re-report (CONTEXT.md "pending lifecycle"). `seenIds` are the rows
 * every scraped transaction resolved to (matched, taken over or inserted), so
 * a still-pending charge is protected by identity, not by a stored id. Callers
 * must only invoke this after the account's import completed without error.
 */
export async function sweepStalePending(args: {
  bankAccountId: string;
  windowStart: string;
  seenIds: ReadonlySet<string>;
  store: PendingSweepStore;
}): Promise<number> {
  const { bankAccountId, windowStart, seenIds, store } = args;
  const pendingIds = await store.findPendingIds(bankAccountId, windowStart);
  const stale = pendingIds.filter((id) => !seenIds.has(id));
  if (stale.length > 0) await store.deleteTransactions(stale);
  return stale.length;
}
