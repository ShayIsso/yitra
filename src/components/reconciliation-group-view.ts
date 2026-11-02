import type { CategorySource } from "@/lib/merchant-memory";

/** One transaction of a pending reconciliation group, as the inbox page hands it over. */
export type PendingMember = {
  id: string;
  bankType: string;
  credentialDisplayName: string;
  date: string;
  description: string;
  chargedAmount: number;
  categoryName: string | null;
  categorySource: CategorySource | null;
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

/**
 * A credit is a positive amount; zero is not one. Routing, the router's write
 * and bulk approve on the server draw the same line (#303). `directionText`
 * deliberately differs: it follows the money colours, which read zero as
 * incoming.
 */
function isCredit(chargedAmount: number): boolean {
  return chargedAmount > 0;
}

/**
 * Mirrors `approveGroup` (reconciliation inbox-ops), which decides from the
 * source alone: a `user`/`memory` row keeps whatever it has, even NULL after its
 * category was deleted; any other row becomes an internal transfer and leaves
 * the totals on its side of the ledger.
 */
export function suspectedTransferConsequence(row: PendingMember): string {
  if (row.categorySource === "user" || row.categorySource === "memory") {
    return row.categoryName
      ? `התנועה כבר מסווגת כ״${row.categoryName}״. אישור ישאיר את הסיווג הזה.`
      : "התנועה סווגה בעבר באופן ידני. אישור לא ישנה את הסיווג שלה.";
  }
  const leaves = isCredit(row.chargedAmount) ? "בהכנסות" : "בהוצאות";
  return `לא נמצא צד שני להעברה. אישור יסמן את התנועה כהעברה פנימית, ולכן היא לא תיספר ${leaves}.`;
}

/**
 * Mirrors `approveGroups`, which skips an incoming suspected transfer on the
 * server: such a row is approved one by one, never swept in with a selection.
 */
export function isBulkApprovable(view: ReconciliationGroupView): boolean {
  return !(view.kind === "suspected-transfer" && isCredit(view.row.chargedAmount));
}

/** Zero reads as incoming, matching the money colours (`amountColorClass`). */
export function directionText(chargedAmount: number): string {
  return chargedAmount < 0 ? "חיוב יוצא" : "זיכוי נכנס";
}

export function confidenceText(confidence: number): string {
  return `ביטחון ${Math.round(confidence * 100)}%`;
}
