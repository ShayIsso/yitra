import type { ScrapedTransaction } from "@/lib/scraper/types";
import { resolveImport, type Categorization, type TransactionStore } from "./import";
import { sweepStalePending, type PendingSweepStore } from "./sweep";

export type AccountImportCounts = {
  inserted: number;
  updated: number;
  skipped: number;
  swept: number;
};

/**
 * Imports one account's scraped transactions, then sweeps the pending rows the
 * scrape no longer reports. The sweep runs only once every transaction was
 * imported: a throw skips it, so a partial scrape never deletes anything. With
 * no `windowStart` (window unknown) or an empty scrape (indistinguishable from a scraper that returned nothing) nothing is swept.
 */
export async function importAccountTransactions(args: {
  transactions: ScrapedTransaction[];
  bankAccountId: string;
  windowStart?: string;
  store: TransactionStore;
  sweepStore: PendingSweepStore;
  categorize: (description: string) => Promise<Categorization>;
}): Promise<AccountImportCounts> {
  const { transactions, bankAccountId, windowStart, store, sweepStore, categorize } = args;
  const counts: AccountImportCounts = { inserted: 0, updated: 0, skipped: 0, swept: 0 };
  const seenIds = new Set<string>();

  for (const tx of transactions) {
    const { outcome, id } = await resolveImport(tx, bankAccountId, store, categorize, seenIds);
    seenIds.add(id);
    counts[outcome]++;
  }

  if (windowStart && transactions.length > 0) {
    counts.swept = await sweepStalePending({
      bankAccountId,
      windowStart,
      seenIds,
      store: sweepStore,
    });
  }
  return counts;
}
