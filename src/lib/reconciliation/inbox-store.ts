/**
 * Drizzle-backed implementation of InboxStore.
 * Also exports the query used by the /reconciliation page.
 */

import { db } from "@/db";
import {
  transactions,
  categories,
  bankAccounts,
  bankCredentials,
  categoryRules,
} from "@/db/schema";
import { and, eq, isNull, inArray, notInArray, or, asc } from "drizzle-orm";
import { supersedeOpenSuggestions } from "@/lib/ai-categorization";
import type { CategorySource } from "@/lib/merchant-memory";
import type { InboxStore, InboxTransaction, ReleaseIntent, TransferFlip } from "./inbox-ops";
import type { RejectedPair } from "./rejected-pairs";
import { RECONCILIATION_CATEGORY_NAMES } from "./category-names";
import { recordRejections } from "./rejection-writes";
import type { CategoryRule } from "@/lib/categories/rules";

// ── Row shape returned by the inbox query ───────────────────────────────────

export type InboxRow = {
  id: string;
  bankAccountId: string;
  bankType: string;
  accountNumber: string;
  credentialDisplayName: string;
  date: string;
  description: string;
  chargedAmount: number;
  categoryId: string | null;
  categoryName: string | null;
  categorySource: CategorySource | null;
  reconciliationGroupId: string;
  reconciliationRole: "settlement_lump" | "settlement_detail" | "transfer_pair";
  reconciliationConfidence: number;
  reconciliationConfirmedAt: Date | null;
  createdAt: Date;
};

// ── Pending inbox query ──────────────────────────────────────────────────────

/**
 * Fetches all transactions pending reconciliation review:
 * - reconciliationGroupId IS NOT NULL
 * - reconciliationConfirmedAt IS NULL (not yet approved)
 */
export async function getPendingInboxRows(): Promise<InboxRow[]> {
  const rows = await db
    .select({
      id: transactions.id,
      bankAccountId: transactions.bankAccountId,
      bankType: bankCredentials.bankType,
      accountNumber: bankAccounts.accountNumber,
      credentialDisplayName: bankCredentials.displayName,
      date: transactions.date,
      description: transactions.description,
      chargedAmount: transactions.chargedAmount,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categorySource: transactions.categorySource,
      reconciliationGroupId: transactions.reconciliationGroupId,
      reconciliationRole: transactions.reconciliationRole,
      reconciliationConfidence: transactions.reconciliationConfidence,
      reconciliationConfirmedAt: transactions.reconciliationConfirmedAt,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .innerJoin(bankAccounts, eq(transactions.bankAccountId, bankAccounts.id))
    .innerJoin(bankCredentials, eq(bankAccounts.credentialId, bankCredentials.id))
    .where(isNull(transactions.reconciliationConfirmedAt))
    // Only rows that belong to a reconciliation group
    .then((rows) => rows.filter((r) => r.reconciliationGroupId !== null));

  return rows
    .filter((r) => r.reconciliationGroupId && r.reconciliationRole && r.reconciliationConfidence)
    .map((r) => ({
      id: r.id,
      bankAccountId: r.bankAccountId,
      bankType: r.bankType,
      accountNumber: r.accountNumber,
      credentialDisplayName: r.credentialDisplayName,
      date: r.date,
      description: r.description,
      chargedAmount: Number(r.chargedAmount),
      categoryId: r.categoryId,
      categoryName: r.categoryName ?? null,
      categorySource: r.categorySource,
      reconciliationGroupId: r.reconciliationGroupId!,
      reconciliationRole: r.reconciliationRole as
        | "settlement_lump"
        | "settlement_detail"
        | "transfer_pair",
      reconciliationConfidence: Number(r.reconciliationConfidence),
      reconciliationConfirmedAt: r.reconciliationConfirmedAt,
      createdAt: r.createdAt,
    }));
}

/**
 * Count distinct pending reconciliation groups (for dashboard strip + sidebar badge).
 */
export async function getPendingGroupCount(): Promise<number> {
  const rows = await db
    .select({ groupId: transactions.reconciliationGroupId })
    .from(transactions)
    .where(isNull(transactions.reconciliationConfirmedAt))
    .then((rows) => rows.filter((r) => r.groupId !== null));

  const distinct = new Set(rows.map((r) => r.groupId));
  return distinct.size;
}

// ── InboxStore (Drizzle) ──────────────────────────────────────────────────────

const memberColumns = {
  id: transactions.id,
  bankAccountId: transactions.bankAccountId,
  bankType: bankCredentials.bankType,
  date: transactions.date,
  description: transactions.description,
  chargedAmount: transactions.chargedAmount,
  categoryId: transactions.categoryId,
  categorySource: transactions.categorySource,
  reconciliationGroupId: transactions.reconciliationGroupId,
  reconciliationRole: transactions.reconciliationRole,
  reconciliationConfidence: transactions.reconciliationConfidence,
  reconciliationConfirmedAt: transactions.reconciliationConfirmedAt,
  createdAt: transactions.createdAt,
};

function rowToInboxTxn(r: {
  id: string;
  bankAccountId: string;
  bankType: string;
  date: string;
  description: string;
  chargedAmount: unknown;
  categoryId: string | null;
  categorySource: CategorySource | null;
  reconciliationGroupId: string | null;
  reconciliationRole: string | null;
  reconciliationConfidence: number | null;
  reconciliationConfirmedAt: Date | null;
  createdAt: Date;
}): InboxTransaction {
  return {
    id: r.id,
    bankAccountId: r.bankAccountId,
    bankType: r.bankType,
    date: r.date,
    description: r.description,
    chargedAmount: Number(r.chargedAmount),
    categoryId: r.categoryId,
    categorySource: r.categorySource,
    reconciliationGroupId: r.reconciliationGroupId,
    reconciliationRole: r.reconciliationRole as InboxTransaction["reconciliationRole"],
    reconciliationConfidence: r.reconciliationConfidence,
    reconciliationConfirmedAt: r.reconciliationConfirmedAt,
    createdAt: r.createdAt,
  };
}

export const drizzleInboxStore: InboxStore = {
  async getGroupMembers(groupId: string): Promise<InboxTransaction[]> {
    const rows = await db
      .select(memberColumns)
      .from(transactions)
      .innerJoin(bankAccounts, eq(transactions.bankAccountId, bankAccounts.id))
      .innerJoin(bankCredentials, eq(bankAccounts.credentialId, bankCredentials.id))
      .where(eq(transactions.reconciliationGroupId, groupId));
    return rows.map(rowToInboxTxn);
  },

  async getGroupMembersByIds(groupIds: string[]): Promise<Map<string, InboxTransaction[]>> {
    if (groupIds.length === 0) return new Map();
    const rows = await db
      .select(memberColumns)
      .from(transactions)
      .innerJoin(bankAccounts, eq(transactions.bankAccountId, bankAccounts.id))
      .innerJoin(bankCredentials, eq(bankAccounts.credentialId, bankCredentials.id))
      .where(inArray(transactions.reconciliationGroupId, groupIds));

    const map = new Map<string, InboxTransaction[]>();
    for (const row of rows) {
      const txn = rowToInboxTxn(row);
      if (!txn.reconciliationGroupId) continue;
      const arr = map.get(txn.reconciliationGroupId) ?? [];
      arr.push(txn);
      map.set(txn.reconciliationGroupId, arr);
    }
    return map;
  },

  async confirmGroup(groupId: string, now: Date, flip: TransferFlip | null): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(transactions)
        .set({ reconciliationConfirmedAt: now })
        .where(eq(transactions.reconciliationGroupId, groupId));
      if (!flip) return;
      const flipped = await tx
        .update(transactions)
        .set({ categoryId: flip.categoryId, categorySource: flip.categorySource })
        .where(
          and(
            eq(transactions.id, flip.txnId),
            eq(transactions.reconciliationGroupId, groupId),
            undefined,
          ),
        )
        .returning({ id: transactions.id });
      if (flipped.length > 0) await supersedeOpenSuggestions([flip.txnId], tx);
    });
  },

  async clearGroup(groupIds: string[], rejections: RejectedPair[] = []): Promise<void> {
    await db.transaction(async (tx) => {
      await recordRejections(tx, rejections);
      for (const groupId of groupIds) {
        await tx
          .update(transactions)
          .set({
            reconciliationGroupId: null,
            reconciliationRole: null,
            reconciliationConfidence: null,
            reconciliationConfirmedAt: null,
          })
          .where(eq(transactions.reconciliationGroupId, groupId));
      }
    });
  },

  async clearRows(txnIds: string[], rejections: RejectedPair[] = []): Promise<void> {
    if (txnIds.length === 0) return;
    await db.transaction(async (tx) => {
      await recordRejections(tx, rejections);
      await tx
        .update(transactions)
        .set({
          reconciliationGroupId: null,
          reconciliationRole: null,
          reconciliationConfidence: null,
          reconciliationConfirmedAt: null,
        })
        .where(inArray(transactions.id, txnIds));
    });
  },

  async setCategory(
    txnId: string,
    categoryId: string | null,
    intent: ReleaseIntent,
  ): Promise<void> {
    // Reconciliation re-runs the rule engine on split/edit rows, so a non-null
    // result is rule-sourced (ADR-0010); clearing resets provenance to NULL.
    // Memory is deliberately NOT consulted here in this slice (issue #135).
    const writable = or(
      isNull(transactions.categorySource),
      notInArray(transactions.categorySource, ["user", "memory"]),
      // By category name, in the write: undo has already cleared the
      // reconciliation columns, so nothing on the row says what wrote its category.
      intent === "undo"
        ? inArray(
            transactions.categoryId,
            db
              .select({ id: categories.id })
              .from(categories)
              .where(inArray(categories.name, [...RECONCILIATION_CATEGORY_NAMES])),
          )
        : undefined,
    );
    await db.transaction(async (tx) => {
      const written = await tx
        .update(transactions)
        .set({ categoryId, categorySource: categoryId === null ? null : "rule" })
        .where(and(eq(transactions.id, txnId), writable))
        .returning({ id: transactions.id });
      if (categoryId !== null && written.length > 0) await supersedeOpenSuggestions([txnId], tx);
    });
  },

  async getCategoryIdByName(name: string): Promise<string | null> {
    const rows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.name, name))
      .limit(1);
    return rows[0]?.id ?? null;
  },

  async getRulesOrderedByPriority(): Promise<CategoryRule[]> {
    // Lower priority number = higher priority (verified by reading categorize() in rules.ts:
    // it sorts desc by priority, so highest number wins — but we fetch all and pass to categorize)
    const rows = await db.select().from(categoryRules).orderBy(asc(categoryRules.priority));
    return rows.map((r) => ({
      id: r.id,
      categoryId: r.categoryId,
      matchType: r.matchType,
      pattern: r.pattern,
      priority: r.priority,
    }));
  },
};
