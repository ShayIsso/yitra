import { randomUUID } from "crypto";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { inArray, isNull, and, lte } from "drizzle-orm";
import { selectUnpairedNotRejected } from "./rejection-writes";

/**
 * Routes transfer-guarded-but-unpaired transactions into the reconciliation
 * inbox as suspected transfers (#148). The AI step reports which uncategorized
 * rows its transfer guard skipped; those still unpaired after P3 have no
 * counterpart to auto-confirm, so they queue here for the user to approve or
 * reject through the EXISTING inbox operations. This keeps reconciliation the
 * only writer of transfer semantics — the AI step never labels anything a
 * transfer, it only hands over the ids.
 */
export interface SuspectedTransferRouter {
  /**
   * Of the given ids, the debits with no reconciliation group yet (unpaired after
   * P3) and not previously rejected as a suspected transfer (a rejected pair).
   * Credits are dropped: a credit is never queued as a singleton (#303).
   */
  filterUnpaired(txnIds: string[]): Promise<string[]>;
  /** Queue a single unpaired debit as a pending suspected-transfer inbox item; a credit is a no-op. */
  queueSuspectedTransfer(txnId: string): Promise<void>;
}

// Single-sided suspicion, well under P3's 0.95 auto-apply threshold, so it can
// only ever queue for review — never auto-confirm. Non-zero so the inbox query's
// truthy-confidence filter surfaces it.
const SUSPECTED_TRANSFER_CONFIDENCE = 0.5;

export const drizzleSuspectedTransferRouter: SuspectedTransferRouter = {
  async filterUnpaired(txnIds: string[]): Promise<string[]> {
    return selectUnpairedNotRejected(db, txnIds);
  },

  async queueSuspectedTransfer(txnId: string): Promise<void> {
    await db
      .update(transactions)
      .set({
        reconciliationGroupId: randomUUID(),
        reconciliationRole: "transfer_pair",
        reconciliationConfidence: SUSPECTED_TRANSFER_CONFIDENCE,
      })
      .where(eqUnpaired(txnId));
  },
};

// Guard the write to still-unpaired rows: a concurrent P-phase confirm between
// filterUnpaired and here must not be clobbered into a fresh singleton group.
// The debit predicate holds the #303 invariant for any caller, not only those
// that went through filterUnpaired first.
function eqUnpaired(txnId: string) {
  return and(
    inArray(transactions.id, [txnId]),
    isNull(transactions.reconciliationGroupId),
    lte(transactions.chargedAmount, "0"),
  );
}
