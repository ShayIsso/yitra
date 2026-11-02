/** One transaction of a pending reconciliation group, as the inbox page hands it over. */
export type PendingMember = {
  id: string;
  bankType: string;
  credentialDisplayName: string;
  date: string;
  description: string;
  chargedAmount: number;
  categoryName: string | null;
  reconciliationRole: "settlement_lump" | "settlement_detail" | "transfer_pair";
};

export type PendingGroup = {
  groupId: string;
  confidence: number;
  members: PendingMember[];
};

/**
 * Which kind of match a group is, read from its members' roles — the shapes
 * the reconciliation phases write (P1 settlement, P2 transfer mirror, and the
 * single-row suspected transfer of #148). Presentation only: approving or
 * rejecting goes through the same inbox operations for every kind.
 */
export type ReconciliationGroupView =
  | {
      kind: "settlement";
      title: string;
      lump: PendingMember;
      details: PendingMember[];
      detailsTotal: number;
    }
  | { kind: "transfer"; title: string; legs: [PendingMember, PendingMember] }
  | { kind: "suspected-transfer"; title: string; row: PendingMember }
  | { kind: "group"; title: string; count: number };

export function reconciliationGroupView(members: PendingMember[]): ReconciliationGroupView {
  const lump = members.find((m) => m.reconciliationRole === "settlement_lump");
  const details = members.filter((m) => m.reconciliationRole === "settlement_detail");
  const pairs = members.filter((m) => m.reconciliationRole === "transfer_pair");

  if (lump && details.length > 0) {
    return {
      kind: "settlement",
      title: "חיוב כרטיס אשראי",
      lump,
      details,
      detailsTotal: details.reduce((sum, d) => sum + d.chargedAmount, 0),
    };
  }
  if (pairs.length === 2) {
    return { kind: "transfer", title: "העברה בין חשבונות", legs: [pairs[0], pairs[1]] };
  }
  if (pairs.length === 1 && members.length === 1) {
    return { kind: "suspected-transfer", title: "חשד להעברה בין חשבונות", row: pairs[0] };
  }
  return { kind: "group", title: "קבוצת תנועות", count: members.length };
}

/** Zero reads as incoming, matching the money colours (`amountColorClass`). */
export function directionText(chargedAmount: number): string {
  return chargedAmount < 0 ? "חיוב יוצא" : "זיכוי נכנס";
}

export function confidenceText(confidence: number): string {
  return `ביטחון ${Math.round(confidence * 100)}%`;
}
