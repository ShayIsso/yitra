import { db } from "@/db";
import { transactions, recurringExpenses } from "@/db/schema";
import { eq, and, isNull, gte, lte, inArray, notInArray } from "drizzle-orm";
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
    categorySource: row.categorySource ?? null,
    customDescription: row.customDescription ?? null,
    reconciliationGroupId: row.reconciliationGroupId ?? null,
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
    async findPendingRows(bankAccountId) {
      const rows = await db.query.transactions.findMany({
        where: and(
          eq(transactions.bankAccountId, bankAccountId),
          eq(transactions.status, "pending"),
        ),
      });
      return rows.map(rowToStored);
    },

    async findCompletedRows(bankAccountId, fromDate) {
      const rows = await db.query.transactions.findMany({
        where: and(
          eq(transactions.bankAccountId, bankAccountId),
          eq(transactions.status, "completed"),
          gte(transactions.date, fromDate),
        ),
      });
      return rows.map(rowToStored);
    },

    // ai_suggestions cascade and category_corrections.transaction_id is SET NULL;
    // recurring_expenses.last_matched_txn_id has no ON DELETE action and would
    // abort the delete, and reconciliation groups are a bare uuid column, so
    // both are resolved here.
    async applySweep(plan) {
      if (plan.deleteIds.length === 0) return;
      await db.transaction(async (tx) => {
        for (const c of plan.carryovers) {
          const changes: Partial<typeof transactions.$inferInsert> = { updatedAt: new Date() };
          if (c.categoryId) {
            changes.categoryId = c.categoryId;
            changes.categorySource = c.categorySource;
          }
          if (c.customDescription) changes.customDescription = c.customDescription;
          await tx.update(transactions).set(changes).where(eq(transactions.id, c.completedId));
        }

        await tx
          .update(recurringExpenses)
          .set({ lastMatchedTxnId: null })
          .where(inArray(recurringExpenses.lastMatchedTxnId, plan.deleteIds));

        if (plan.releaseGroupIds.length > 0) {
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
                inArray(transactions.reconciliationGroupId, plan.releaseGroupIds),
                notInArray(transactions.id, plan.deleteIds),
              ),
            );
        }

        await tx
          .delete(transactions)
          .where(and(inArray(transactions.id, plan.deleteIds), eq(transactions.status, "pending")));
      });
    },
  };
}
