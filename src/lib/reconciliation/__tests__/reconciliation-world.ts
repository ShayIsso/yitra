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
export function createWorld(seed: WorldRow[]) {
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
      return null;
    },
    async applyAutoReconciliation() {
      throw new Error("auto-apply not expected in this world: no transfer category");
    },
    async queueReconciliation(a) {
      assign(
        a.groupId,
        [a.bankLumpId, ...a.cardDetailIds],
        (id) => (id === a.bankLumpId ? "settlement_lump" : "settlement_detail"),
        a.confidence,
      );
    },
    async applyAutoMirror() {
      throw new Error("auto-apply not expected in this world: no transfer category");
    },
    async queueMirror(a) {
      assign(a.groupId, [a.bankSideId, a.cardSideId], () => "transfer_pair", a.confidence);
    },
    async applyAutoInterAccount() {
      throw new Error("auto-apply not expected in this world: no transfer category");
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
    async confirmGroup() {},
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
    async clearRows() {},
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
    reconciliation,
    inbox,
    pendingGroups(): string[] {
      return [...new Set(rows.map((r) => r.reconciliationGroupId).filter((g): g is string => !!g))];
    },
    groupOf(id: string): string | null {
      return byId(id).reconciliationGroupId;
    },
  };
}
