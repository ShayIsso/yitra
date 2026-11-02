import { min } from "drizzle-orm";
import { db } from "@/db";
import { bankCredentials, transactions } from "@/db/schema";
import { getMonthTransactionDetails } from "@/lib/analytics";
import { drizzleRecurringStore } from "@/lib/recurring-detection";
// Deep import, as the other server readers of sync runs do: the sync barrel
// loads the scraper.
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
        .select({ earliest: min(transactions.date) })
        .from(transactions)
        .groupBy(transactions.bankAccountId);
      return rows.flatMap((r) => (r.earliest ? [r.earliest] : []));
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
      const { syncClaimHeldSince } = await import("@/lib/sync");
      return syncClaimHeldSince();
    },
  };
}
