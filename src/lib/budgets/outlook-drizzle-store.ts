import { eq, min } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, bankCredentials, transactions } from "@/db/schema";
import { getMonthTransactionDetails } from "@/lib/analytics";
import { drizzleRecurringStore } from "@/lib/recurring-detection";
// Deep imports, as the other server readers of sync runs do: the sync barrel
// loads the scraper.
import { syncClaimHeldSince } from "@/lib/sync/process-claim";
import {
  drizzleSyncRunStore,
  getFirstRecordedSuccessAt,
  getLastRecordedSuccessPerBank,
  getLastRunPerBank,
} from "@/lib/sync/runs";
import type { MonthOutlookStore } from "./outlook-store";

/** The month outlook's Drizzle store; the target read is the budgets module's own. */
export function makeDrizzleMonthOutlookStore(
  expenseTarget: () => Promise<number | null>,
): MonthOutlookStore {
  return {
    loadMonth(month) {
      return getMonthTransactionDetails(month.year, month.month);
    },

    // Deleting a credential cascades to its accounts and their transactions,
    // so every account grouped here is a current one.
    async accountHistoryStarts() {
      const rows = await db
        .select({ credentialId: bankAccounts.credentialId, earliest: min(transactions.date) })
        .from(transactions)
        .innerJoin(bankAccounts, eq(transactions.bankAccountId, bankAccounts.id))
        .groupBy(bankAccounts.id, bankAccounts.credentialId);
      return rows.flatMap((r) =>
        r.earliest ? [{ credentialId: r.credentialId, earliest: r.earliest }] : [],
      );
    },

    expenseTarget,

    async recurring() {
      const [patterns, txns] = await Promise.all([
        drizzleRecurringStore.getPersistedPatterns(),
        drizzleRecurringStore.getTransactionsForDetection(),
      ]);
      return { patterns, transactions: txns };
    },

    async credentialBankTypes() {
      const rows = await db.select({ bankType: bankCredentials.bankType }).from(bankCredentials);
      return rows.map((r) => r.bankType);
    },

    lastRunPerBank() {
      return getLastRunPerBank(drizzleSyncRunStore);
    },

    lastRecordedSuccessPerBank() {
      return getLastRecordedSuccessPerBank();
    },

    firstRecordedSuccessAt() {
      return getFirstRecordedSuccessAt();
    },

    async syncRunningSince() {
      return syncClaimHeldSince();
    },
  };
}
