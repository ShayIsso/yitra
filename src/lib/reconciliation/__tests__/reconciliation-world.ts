import type { ReconciliationStore } from "../store";
import type { InboxStore, InboxTransaction } from "../inbox-ops";
import type { ReconciliationTransaction } from "../types";
import { toRejectedPairs, type RejectedPair } from "../rejected-pairs";

type Role = InboxTransaction["reconciliationRole"];

type Row = ReconciliationTransaction & {
  role: Role;
  confidence: number | null;
  confirmedAt: Date | null;
};

export type WorldRow = Pick<
  ReconciliationTransaction,
  "id" | "bankAccountId" | "bankType" | "date" | "chargedAmount" | "description"
>;

/**
 * An in-memory database shared by the reconciliation and inbox stores, so a
 * test can drive the real sequence: detect, reject in the inbox, detect again.
 */
export function createWorld(seed: WorldRow[], options: { transferCategory?: boolean } = {}) {
  const rows: Row[] = seed.map((r) => ({
    ...r,
    categoryId: null,
    reconciliationGroupId: null,
    role: null,
    confidence: null,
    confirmedAt: null,
  }));
  const rejections: RejectedPair[] = [];

  const byId = (id: string) => rows.find((r) => r.id === id)!;

  function assign(groupId: string, ids: string[], role: (id: string) => Role, confidence: number) {
    for (const id of ids) {
      const row = byId(id);
      row.reconciliationGroupId = groupId;
      row.role = role(id);
      row.confidence = confidence;
    }
  }

  function confirm(groupId: string) {
    for (const r of rows) if (r.reconciliationGroupId === groupId) r.confirmedAt = new Date();
  }

  const reconciliation: ReconciliationStore = {
    async getRecentTransactions() {
      return rows.map((r) => ({
        id: r.id,
        bankAccountId: r.bankAccountId,
        bankType: r.bankType,
        date: r.date,
        chargedAmount: r.chargedAmount,
        description: r.description,
        categoryId: r.categoryId,
        reconciliationGroupId: r.reconciliationGroupId,
      }));
    },
    async getRejectedPairs() {
      return toRejectedPairs(rejections);
    },
    async getCategoryIdByName() {
      return options.transferCategory ? "cat-transfer" : null;
    },
    async applyAutoReconciliation() {
      throw new Error("auto-apply of settlements is not modelled in this world");
    },
    async queueReconciliation(a) {
      assign(
        a.groupId,
        [a.bankLumpId, ...a.cardDetailIds],
        (id) => (id === a.bankLumpId ? "settlement_lump" : "settlement_detail"),
        a.confidence,
      );
    },
    async applyAutoMirror(a) {
      assign(a.groupId, [a.bankSideId, a.cardSideId], () => "transfer_pair", a.confidence);
      byId(a.bankSideId).categoryId = a.transferCategoryId;
      confirm(a.groupId);
    },
    async queueMirror(a) {
      assign(a.groupId, [a.bankSideId, a.cardSideId], () => "transfer_pair", a.confidence);
    },
    async applyAutoInterAccount(a) {
      assign(a.groupId, [a.outgoingSideId, a.incomingSideId], () => "transfer_pair", a.confidence);
      confirm(a.groupId);
    },
    async queueInterAccount(a) {
      assign(a.groupId, [a.outgoingSideId, a.incomingSideId], () => "transfer_pair", a.confidence);
    },
  };

  const toInbox = (r: Row): InboxTransaction => ({
    id: r.id,
    bankAccountId: r.bankAccountId,
    bankType: r.bankType,
    date: r.date,
    description: r.description,
    chargedAmount: r.chargedAmount,
    categoryId: r.categoryId,
    reconciliationGroupId: r.reconciliationGroupId,
    reconciliationRole: r.role,
    reconciliationConfidence: r.confidence,
    reconciliationConfirmedAt: r.confirmedAt,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });

  const inbox: InboxStore = {
    async getGroupMembers(groupId) {
      return rows.filter((r) => r.reconciliationGroupId === groupId).map(toInbox);
    },
    async getGroupMembersByIds() {
      return new Map();
    },
    async confirmGroup(groupId) {
      confirm(groupId);
    },
    async clearGroup(groupIds, recordRejections = []) {
      rejections.push(...recordRejections);
      for (const r of rows) {
        if (r.reconciliationGroupId && groupIds.includes(r.reconciliationGroupId)) {
          r.reconciliationGroupId = null;
          r.role = null;
          r.confidence = null;
          r.confirmedAt = null;
        }
      }
    },
    async clearRows(txnIds, recordRejections = []) {
      rejections.push(...recordRejections);
      for (const r of rows) {
        if (txnIds.includes(r.id)) {
          r.reconciliationGroupId = null;
          r.role = null;
          r.confidence = null;
          r.confirmedAt = null;
        }
      }
    },
    async setCategory() {},
    async getCategoryIdByName() {
      return null;
    },
    async getRulesOrderedByPriority() {
      return [];
    },
  };

  return {
    addRow(r: WorldRow) {
      rows.push({
        ...r,
        categoryId: null,
        reconciliationGroupId: null,
        role: null,
        confidence: null,
        confirmedAt: null,
      });
    },
    queueSuspected(id: string) {
      assign(`suspect-${id}`, [id], () => "transfer_pair", 0.5);
    },
    reconciliation,
    inbox,
    rejectedPairs(): RejectedPair[] {
      return [...rejections];
    },
    confirmedGroups(): string[] {
      return [...new Set(rows.filter((r) => r.confirmedAt).map((r) => r.reconciliationGroupId!))];
    },
    pendingGroups(): string[] {
      return [...new Set(rows.map((r) => r.reconciliationGroupId).filter((g): g is string => !!g))];
    },
    groupOf(id: string): string | null {
      return byId(id).reconciliationGroupId;
    },
  };
}
