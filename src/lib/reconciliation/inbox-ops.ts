/**
 * Pure business logic for reconciliation inbox operations.
 * All functions accept a store interface — no direct DB calls here.
 * This keeps the logic testable without a real database.
 */

import { categorize, type CategoryRule } from "@/lib/categories/rules";
import { bankKindOf } from "@/lib/bank-registry";
import type { CategorySource } from "@/lib/merchant-memory";
import { pairsToRecordOnReject, pairsToRecordOnUndo, type RejectedPair } from "./rejected-pairs";

export type InboxTransaction = {
  id: string;
  bankAccountId: string;
  bankType: string;
  date: string; // YYYY-MM-DD
  description: string;
  chargedAmount: number;
  categoryId: string | null;
  categorySource: CategorySource | null;
  reconciliationGroupId: string | null;
  reconciliationRole: "settlement_lump" | "settlement_detail" | "transfer_pair" | null;
  reconciliationConfidence: number | null;
  reconciliationConfirmedAt: Date | null;
  createdAt: Date;
};

export type InboxGroup = {
  groupId: string;
  members: InboxTransaction[];
};

/**
 * The one category write an approval makes: the transfer side of a
 * `transfer_pair` group becomes an internal transfer. The approval is the
 * user's decision, so it is recorded as `user` provenance, never `rule`.
 */
export type TransferFlip = {
  txnId: string;
  categoryId: string;
  categorySource: "user";
  /**
   * Skip the flip if the row is `user`/`memory`-sourced at write time. Set for
   * a suspected transfer, so a category chosen after `approveGroup` read the
   * members still wins; a pair flips regardless (see `transferFlipFor`).
   */
  keepUserCategory: boolean;
};

export type InboxStore = {
  getGroupMembers(groupId: string): Promise<InboxTransaction[]>;
  getGroupMembersByIds(groupIds: string[]): Promise<Map<string, InboxTransaction[]>>;
  /** Confirms every member of the group and applies `flip`, if any, in one transaction. */
  confirmGroup(groupId: string, now: Date, flip: TransferFlip | null): Promise<void>;
  /** Clears the groups and persists `rejections` in the same transaction. */
  clearGroup(groupIds: string[], rejections?: RejectedPair[]): Promise<void>;
  /** Clears the rows and persists `rejections` in the same transaction. */
  clearRows(txnIds: string[], rejections?: RejectedPair[]): Promise<void>;
  setCategory(txnId: string, categoryId: string | null): Promise<void>;
  getCategoryIdByName(name: string): Promise<string | null>;
  getRulesOrderedByPriority(): Promise<CategoryRule[]>;
};

/**
 * Identify the bankSide row in a transfer_pair group.
 *
 * Heuristic (in priority order):
 * 1. If one row has description containing "ביט" (Bit) markers, that is the cardSide;
 *    the other is bankSide.
 * 2. If both or neither have markers, prefer the row whose institution's registry
 *    `kind` is "bank" over one that is not (a card, prepaid or unknown kind alike).
 * 3. If that still does not separate them, pick the row with earlier createdAt as
 *    bankSide (deterministic tie-break).
 *
 * Rationale: A future PR may add an explicit role-side column — this heuristic
 * bridges the gap until then.
 */
export function identifyBankSide(members: InboxTransaction[]): InboxTransaction | null {
  // A singleton suspected-transfer group (AI-step routing, #148): its only member
  // is the side to flip to the transfer category on approve. Genuine pairs below.
  if (members.length === 1) return members[0];
  if (members.length !== 2) return null;
  const [a, b] = members;

  const BIT_MARKER = /ביט/i;
  const aHasBit = BIT_MARKER.test(a.description);
  const bHasBit = BIT_MARKER.test(b.description);

  // Rule 1: the non-marker row is bankSide
  if (aHasBit && !bHasBit) return b;
  if (bHasBit && !aHasBit) return a;

  // Rule 2: prefer the bank-kind row as bankSide
  const aIsBank = bankKindOf(a.bankType) === "bank";
  const bIsBank = bankKindOf(b.bankType) === "bank";
  if (aIsBank && !bIsBank) return a;
  if (bIsBank && !aIsBank) return b;

  // Rule 3: deterministic tie-break — earlier createdAt is bankSide
  return a.createdAt <= b.createdAt ? a : b;
}

/**
 * A suspected transfer whose only row is incoming. New ones are never queued
 * (#303); ones queued before that are left for a one-by-one decision.
 */
function isSingletonCredit(members: InboxTransaction[]): boolean {
  return (
    members.length === 1 &&
    members[0].reconciliationRole === "transfer_pair" &&
    members[0].chargedAmount > 0
  );
}

async function transferFlipFor(
  members: InboxTransaction[],
  store: InboxStore,
): Promise<TransferFlip | null> {
  // P1 settlement group: the lump already carries the settlement category.
  if (members.some((m) => m.reconciliationRole === "settlement_lump")) return null;

  const bankSide = identifyBankSide(members);
  if (!bankSide) return null;
  // A suspected transfer has no second leg to double-count against, so a
  // category the user chose (or user-tier memory applied) after it was queued
  // outranks the suspicion. A pair keeps its flip: without it both legs count.
  const keepUserCategory = members.length === 1;
  if (
    keepUserCategory &&
    (bankSide.categorySource === "user" || bankSide.categorySource === "memory")
  ) {
    return null;
  }

  const transferCategoryId = await store.getCategoryIdByName("העברה פנימית");
  if (!transferCategoryId) return null;
  return {
    txnId: bankSide.id,
    categoryId: transferCategoryId,
    categorySource: "user",
    keepUserCategory,
  };
}

async function approveMembers(
  groupId: string,
  members: InboxTransaction[],
  store: InboxStore,
): Promise<void> {
  // Approving never writes merchant memory: a memory entry mapping a
  // "העברה מ…" key to an internal transfer would swallow every later credit
  // with that descriptor, salaries included (#303).
  await store.confirmGroup(groupId, new Date(), await transferFlipFor(members, store));
}

export async function approveGroup(
  groupId: string,
  store: InboxStore,
): Promise<{ error?: string }> {
  const members = await store.getGroupMembers(groupId);
  if (members.length === 0) return { error: "קבוצת ההתאמה לא נמצאה" };
  await approveMembers(groupId, members, store);
  return {};
}

/** Approves each group in turn; a singleton credit is skipped, never swept in by bulk. */
export async function approveGroups(
  groupIds: string[],
  store: InboxStore,
): Promise<{ error?: string; skipped: string[] }> {
  const skipped: string[] = [];
  for (const groupId of groupIds) {
    const members = await store.getGroupMembers(groupId);
    if (members.length === 0) return { error: "קבוצת ההתאמה לא נמצאה", skipped };
    if (isSingletonCredit(members)) {
      skipped.push(groupId);
      continue;
    }
    await approveMembers(groupId, members, store);
  }
  return { skipped };
}

export async function rejectGroup(groupId: string, store: InboxStore): Promise<{ error?: string }> {
  const members = await store.getGroupMembers(groupId);
  if (members.length === 0) return { error: "קבוצת ההתאמה לא נמצאה" };

  // Queued candidates do NOT have their category flipped — only re-rule-engine
  // rows that were part of an auto-applied group (reconciliationConfirmedAt set).
  // For the queue case, just clear reconciliation columns; category is unchanged.
  // The rejected pairs are recorded with the clear, so no sync can re-propose them.
  await store.clearGroup([groupId], pairsToRecordOnReject(members));

  // Re-run rule engine for any rows whose category may have been system-assigned
  const rules = await store.getRulesOrderedByPriority();
  for (const member of members) {
    const newCategoryId = categorize(member.description, rules);
    await store.setCategory(member.id, newCategoryId);
  }

  return {};
}

export async function rejectGroups(
  groupIds: string[],
  store: InboxStore,
): Promise<{ error?: string }> {
  for (const groupId of groupIds) {
    const result = await rejectGroup(groupId, store);
    if (result.error) return result;
  }
  return {};
}

export async function undoTransaction(
  txnId: string,
  allGroupMembers: InboxTransaction[],
  store: InboxStore,
): Promise<{ error?: string }> {
  const txn = allGroupMembers.find((m) => m.id === txnId);
  if (!txn) return { error: "עסקה לא נמצאה" };
  if (!txn.reconciliationGroupId) return { error: "העסקה אינה חלק מקבוצת התאמה" };

  const rules = await store.getRulesOrderedByPriority();

  await store.clearRows(
    [txnId],
    pairsToRecordOnUndo(
      txnId,
      allGroupMembers.filter((m) => m.reconciliationGroupId === txn.reconciliationGroupId),
    ),
  );
  const newCategoryId = categorize(txn.description, rules);
  await store.setCategory(txnId, newCategoryId);

  const remaining = allGroupMembers.filter(
    (m) => m.id !== txnId && m.reconciliationGroupId === txn.reconciliationGroupId,
  );

  if (remaining.length <= 1) {
    // Group has become a singleton (or is empty) — clear the remaining member too
    for (const rem of remaining) {
      await store.clearRows([rem.id]);
      const remCategoryId = categorize(rem.description, rules);
      await store.setCategory(rem.id, remCategoryId);
    }
  }

  return {};
}
