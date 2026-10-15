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
 * Imports one account's scraped transactions, then sweeps stale pending rows.
 * The sweep runs only once every transaction was imported: a throw skips it, so
 * a partial scrape never deletes anything. With no `windowStart` nothing is swept.
 *
 * Still-pending transactions resolve first so their rows are claimed before a
 * completed transaction can take one over — scrape order differs per bank.
 *
 * In-window sweeping needs this scrape to have reported at least one pending
 * transaction for the account: the library silently drops a failed pending
 * fetch on an otherwise successful scrape, and acting on that absence would
 * delete live charges. Trade-off: an orphan on an account with no live pending
 * waits until a pending row appears.
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

  const ordered = [
    ...transactions.filter((tx) => tx.status === "pending"),
    ...transactions.filter((tx) => tx.status !== "pending"),
  ];
  for (const tx of ordered) {
    const { outcome, id } = await resolveImport(tx, bankAccountId, store, categorize, seenIds);
    seenIds.add(id);
    counts[outcome]++;
  }

  if (windowStart) {
    counts.swept = await sweepStalePending({
      bankAccountId,
      windowStart,
      seenIds,
      reportedPending: transactions.some((tx) => tx.status === "pending"),
      store: sweepStore,
    });
  }
  return counts;
}
