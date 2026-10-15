import { and, eq, inArray, isNull, notExists, sql } from "drizzle-orm";
import type { db } from "@/db";
import { reconciliationRejections, transactions } from "@/db/schema";
import { canonicalPair, type RejectedPair } from "./rejected-pairs";

/** The drizzle handle or a transaction on it, so callers choose the atomicity. */
export type RejectionExecutor = Pick<typeof db, "execute" | "select">;

/**
 * Persists rejected pairs. Inserts only while both transactions still exist:
 * a row the sync swept between the read and this write must not abort the
 * reject, and the FK cascade would have removed its rejection anyway.
 */
export async function recordRejections(
  executor: RejectionExecutor,
  pairs: RejectedPair[],
): Promise<void> {
  for (const [x, y] of pairs) {
    const [a, b] = canonicalPair(x, y);
    await executor.execute(sql`
      INSERT INTO ${reconciliationRejections} (txn_a_id, txn_b_id)
      SELECT ${a}::uuid, ${b}::uuid
      WHERE EXISTS (SELECT 1 FROM ${transactions} WHERE id = ${a}::uuid)
        AND EXISTS (SELECT 1 FROM ${transactions} WHERE id = ${b}::uuid)
      ON CONFLICT DO NOTHING
    `);
  }
}

/** Of `txnIds`, the rows with no reconciliation group and no self-rejection. */
export async function selectUnpairedNotRejected(
  executor: RejectionExecutor,
  txnIds: string[],
): Promise<string[]> {
  if (txnIds.length === 0) return [];
  const rows = await executor
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        inArray(transactions.id, txnIds),
        isNull(transactions.reconciliationGroupId),
        notExists(
          executor
            .select({ one: reconciliationRejections.txnAId })
            .from(reconciliationRejections)
            .where(
              and(
                eq(reconciliationRejections.txnAId, transactions.id),
                eq(reconciliationRejections.txnBId, transactions.id),
              ),
            ),
        ),
      ),
    );
  return rows.map((r) => r.id);
}
