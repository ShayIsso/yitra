/**
 * Pure business logic for reconciliation inbox operations.
 * All functions accept a store interface — no direct DB calls here.
 * This keeps the logic testable without a real database.
 */

import { categorize, type CategoryRule } from "@/lib/categories/rules";
import { bankKindOf } from "@/lib/bank-registry";
import type { CategorySource } from "@/lib/merchant-memory";
import { TRANSFER_CATEGORY_NAME } from "./category-names";
import { isOwnAccountTransfer } from "./own-account-transfer";
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
 * A category write an approval makes: a `transfer_pair` leg becomes an
 * internal transfer. The approval is the user's decision, so it is recorded as
 * `user` provenance, never `rule`.
 */
export type TransferFlip = {
  txnId: string;
  categoryId: string;
  categorySource: "user";
  /**
   * Skip the flip if the row is `user`/`memory`-sourced at write time. Set for
   * a suspected transfer, so a category chosen after `approveGroup` read the
   * members still wins; a pair flips regardless (see `legsToFlip`).
   */
  keepUserCategory: boolean;
};

/** What a category reset is undoing: see `InboxStore.setCategory`. */
export type ReleaseIntent = "reject" | "undo";

export type InboxStore = {
  getGroupMembers(groupId: string): Promise<InboxTransaction[]>;
  getGroupMembersByIds(groupIds: string[]): Promise<Map<string, InboxTransaction[]>>;
  /** Confirms every member of the group and applies `flips` in one transaction. */
  confirmGroup(groupId: string, now: Date, flips: TransferFlip[]): Promise<void>;
  /** Clears the groups and persists `rejections` in the same transaction. */
  clearGroup(groupIds: string[], rejections?: RejectedPair[]): Promise<void>;
  /** Clears the rows and persists `rejections` in the same transaction. */
  clearRows(txnIds: string[], rejections?: RejectedPair[]): Promise<void>;
  /**
   * Resets the row to `categoryId` (a rule result, or null), unless it carries a
   * `user`/`memory` category at write time (the guard is in the write, so a
   * category chosen after the caller read the row still wins).
   * - `reject`: an unconfirmed group; reconciliation wrote nothing to release.
   * - `undo`: a confirmed group; also releases the categories reconciliation
   *   itself writes (internal transfer, card settlement), which can sit under a
   *   stale `user`/`memory` source because auto-apply leaves provenance alone.
   */
  setCategory(txnId: string, categoryId: string | null, intent: ReleaseIntent): Promise<void>;
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

/** The legs an approval turns into internal transfers, and whether a `user`/`memory` category survives. */
function legsToFlip(
  members: InboxTransaction[],
): { legs: InboxTransaction[]; keepUserCategory: boolean } | null {
  // Only a transfer_pair group is ever re-typed: P1 lumps already carry the
  // settlement category, and leftover settlement details are real card charges.
  if (!members.every((m) => m.reconciliationRole === "transfer_pair")) return null;

  // Own-account transfer (P3): like a P2 mirror, the pair has a second leg to
  // double-count against, so both legs flip whatever their source. Keeping a
  // leg's category would bring the half-flip back, and a `memory` entry keyed
  // on a `העברה מ…` descriptor can mislabel a credit as income (#342).
  if (isOwnAccountTransfer(members)) return { legs: members, keepUserCategory: false };

  const bankSide = identifyBankSide(members);
  if (!bankSide) return null;
  // A suspected transfer has no second leg to double-count against, so a
  // category the user chose (or user-tier memory applied) after it was queued
  // outranks the suspicion (#303). A P2 mirror flips its bank side regardless:
  // it is one charge seen from two accounts, so without it the charge counts twice.
  const isSuspected = members.length === 1;
  if (isSuspected && (bankSide.categorySource === "user" || bankSide.categorySource === "memory")) {
    return null;
  }
  return { legs: [bankSide], keepUserCategory: isSuspected };
}

async function transferFlipsFor(
  members: InboxTransaction[],
  store: InboxStore,
): Promise<TransferFlip[]> {
  const plan = legsToFlip(members);
  if (!plan) return [];
  const categoryId = await store.getCategoryIdByName(TRANSFER_CATEGORY_NAME);
  if (!categoryId) return [];
  return plan.legs.map((leg) => ({
    txnId: leg.id,
    categoryId,
    categorySource: "user",
    keepUserCategory: plan.keepUserCategory,
  }));
}

async function approveMembers(
  groupId: string,
  members: InboxTransaction[],
  store: InboxStore,
): Promise<void> {
  // Approving never writes merchant memory: a memory entry mapping a
  // "העברה מ…" key to an internal transfer would swallow every later credit
  // with that descriptor, salaries included (#303).
  await store.confirmGroup(groupId, new Date(), await transferFlipsFor(members, store));
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

async function rejectMembers(
  groupId: string,
  members: InboxTransaction[],
  rules: CategoryRule[],
  store: InboxStore,
): Promise<void> {
  // The rejected pairs are recorded with the clear, so no sync can re-propose them.
  await store.clearGroup([groupId], pairsToRecordOnReject(members));
  for (const member of members) {
    await store.setCategory(member.id, categorize(member.description, rules), "reject");
  }
}

export async function rejectGroup(groupId: string, store: InboxStore): Promise<{ error?: string }> {
  const members = await store.getGroupMembers(groupId);
  if (members.length === 0) return { error: "קבוצת ההתאמה לא נמצאה" };
  await rejectMembers(groupId, members, await store.getRulesOrderedByPriority(), store);
  return {};
}

export async function rejectGroups(
  groupIds: string[],
  store: InboxStore,
): Promise<{ error?: string }> {
  const rules = await store.getRulesOrderedByPriority();
  for (const groupId of groupIds) {
    const members = await store.getGroupMembers(groupId);
    if (members.length === 0) return { error: "קבוצת ההתאמה לא נמצאה" };
    await rejectMembers(groupId, members, rules, store);
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
  await store.setCategory(txnId, categorize(txn.description, rules), "undo");

  const remaining = allGroupMembers.filter(
    (m) => m.id !== txnId && m.reconciliationGroupId === txn.reconciliationGroupId,
  );

  if (remaining.length <= 1) {
    // Group has become a singleton (or is empty) — clear the remaining member too
    for (const rem of remaining) {
      await store.clearRows([rem.id]);
      await store.setCategory(rem.id, categorize(rem.description, rules), "undo");
    }
  }

  return {};
}
