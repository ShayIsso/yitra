import { db } from "@/db";
import { transactions, recurringExpenses } from "@/db/schema";
import { eq, and, isNull, isNotNull, gte, lte, inArray, notInArray } from "drizzle-orm";
import type { TransactionStore, StoredTransaction, NewTransaction } from "./import";
import type { PendingSweepStore } from "./sweep";

function rowToStored(row: typeof transactions.$inferSelect): StoredTransaction {
  return {
    id: row.id,
    bankAccountId: row.bankAccountId,
    externalId: row.externalId ?? null,
    date: row.date,
    processedDate: row.processedDate,
    description: row.description,
    chargedAmount: Number(row.chargedAmount),
    status: row.status,
    categoryId: row.categoryId ?? null,
  };
}

export function createDbStore(): TransactionStore {
  return {
    async findByExternalId(externalId, bankAccountId) {
      const row = await db.query.transactions.findFirst({
        where: and(
          eq(transactions.externalId, externalId),
          eq(transactions.bankAccountId, bankAccountId),
        ),
      });
      return row ? rowToStored(row) : null;
    },

    async findByComposite(date, chargedAmount, description, bankAccountId) {
      const row = await db.query.transactions.findFirst({
        where: and(
          isNull(transactions.externalId),
          eq(transactions.date, date),
          eq(transactions.chargedAmount, chargedAmount.toString()),
          eq(transactions.description, description),
          eq(transactions.bankAccountId, bankAccountId),
        ),
      });
      return row ? rowToStored(row) : null;
    },

    async findOpenPending(bankAccountId, fromDate, toDate) {
      const rows = await db.query.transactions.findMany({
        where: and(
          eq(transactions.bankAccountId, bankAccountId),
          eq(transactions.status, "pending"),
          isNull(transactions.externalId),
          gte(transactions.date, fromDate),
          lte(transactions.date, toDate),
        ),
      });
      return rows.map(rowToStored);
    },

    async insert(tx: NewTransaction) {
      const [row] = await db
        .insert(transactions)
        .values({
          bankAccountId: tx.bankAccountId,
          externalId: tx.externalId,
          date: tx.date,
          processedDate: tx.processedDate,
          description: tx.description,
          memo: tx.memo,
          originalAmount: tx.originalAmount.toString(),
          originalCurrency: tx.originalCurrency,
          chargedAmount: tx.chargedAmount.toString(),
          chargedCurrency: tx.chargedCurrency,
          type: tx.type,
          installmentNumber: tx.installmentNumber,
          installmentTotal: tx.installmentTotal,
          status: tx.status,
          categoryId: tx.categoryId,
          categorySource: tx.categorySource,
        })
        .returning({ id: transactions.id });
      return row.id;
    },

    async update(id, changes) {
      const dbChanges: Partial<typeof transactions.$inferInsert> = {};
      if (changes.status !== undefined) dbChanges.status = changes.status;
      if (changes.processedDate !== undefined) dbChanges.processedDate = changes.processedDate;
      if (changes.chargedAmount !== undefined)
        dbChanges.chargedAmount = changes.chargedAmount.toString();
      if (changes.externalId !== undefined) dbChanges.externalId = changes.externalId;
      if (changes.date !== undefined) dbChanges.date = changes.date;
      if (changes.description !== undefined) dbChanges.description = changes.description;
      dbChanges.updatedAt = new Date();
      await db.update(transactions).set(dbChanges).where(eq(transactions.id, id));
    },
  };
}

export function createDbPendingSweepStore(): PendingSweepStore {
  return {
    async findPendingIds(bankAccountId, fromDate) {
      const rows = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.bankAccountId, bankAccountId),
            eq(transactions.status, "pending"),
            gte(transactions.date, fromDate),
          ),
        );
      return rows.map((r) => r.id);
    },

    // ai_suggestions cascade and category_corrections.transaction_id is SET NULL;
    // recurring_expenses.last_matched_txn_id has no ON DELETE action and would
    // abort the delete, and reconciliation groups are a bare uuid column, so
    // both are resolved here.
    async deleteTransactions(ids) {
      if (ids.length === 0) return;
      await db.transaction(async (tx) => {
        await tx
          .update(recurringExpenses)
          .set({ lastMatchedTxnId: null })
          .where(inArray(recurringExpenses.lastMatchedTxnId, ids));

        const groups = await tx
          .selectDistinct({ groupId: transactions.reconciliationGroupId })
          .from(transactions)
          .where(and(inArray(transactions.id, ids), isNotNull(transactions.reconciliationGroupId)));
        const groupIds = groups.flatMap((g) => (g.groupId ? [g.groupId] : []));
        if (groupIds.length > 0) {
          await tx
            .update(transactions)
            .set({
              reconciliationGroupId: null,
              reconciliationRole: null,
              reconciliationConfidence: null,
              reconciliationConfirmedAt: null,
            })
            .where(
              and(
                inArray(transactions.reconciliationGroupId, groupIds),
                notInArray(transactions.id, ids),
              ),
            );
        }

        await tx
          .delete(transactions)
          .where(and(inArray(transactions.id, ids), eq(transactions.status, "pending")));
      });
    },
  };
}
