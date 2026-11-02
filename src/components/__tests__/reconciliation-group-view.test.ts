import { describe, it, expect } from "vitest";
import {
  confidenceText,
  directionText,
  isBulkApprovable,
  reconciliationGroupView,
  suspectedTransferConsequence,
  type PendingMember,
} from "@/components/reconciliation-group-view";

function member(
  role: PendingMember["reconciliationRole"],
  chargedAmount: number,
  id = `tx-${role}-${chargedAmount}`,
): PendingMember {
  return {
    id,
    bankType: "synthetic-bank",
    credentialDisplayName: "Synthetic account",
    date: "2026-03-10",
    description: "Synthetic row",
    chargedAmount,
    categoryName: null,
    categorySource: null,
    reconciliationRole: role,
  };
}

describe("what a reconciliation group is, as the inbox presents it", () => {
  it("is a card settlement when a bank lump comes with its card details", () => {
    const lump = member("settlement_lump", -900);
    const details = [member("settlement_detail", -400), member("settlement_detail", -500)];
    expect(reconciliationGroupView([lump, ...details])).toEqual({
      kind: "settlement",
      title: "חיוב כרטיס אשראי",
      lump,
      details,
      detailsTotal: -900,
    });
  });

  it("is a transfer between accounts when it pairs two legs", () => {
    const out = member("transfer_pair", -500);
    const back = member("transfer_pair", 500);
    expect(reconciliationGroupView([out, back])).toEqual({
      kind: "transfer",
      title: "העברה בין חשבונות",
      legs: [out, back],
    });
  });

  it("is a suspected transfer when a single row has no counterpart", () => {
    const only = member("transfer_pair", 1200);
    expect(reconciliationGroupView([only])).toEqual({
      kind: "suspected-transfer",
      title: "חשד להעברה בין חשבונות",
      row: only,
    });
  });

  it("falls back to a plain group for any other shape", () => {
    const rows = [
      member("transfer_pair", -1),
      member("transfer_pair", 1),
      member("transfer_pair", 2),
    ];
    expect(reconciliationGroupView(rows)).toEqual({
      kind: "group",
      title: "קבוצת תנועות",
      count: 3,
    });
  });

  it("treats a lump without card details as a plain group", () => {
    expect(reconciliationGroupView([member("settlement_lump", -300)]).kind).toBe("group");
  });
});

describe("the direction of money, in words", () => {
  it("names a credit as incoming and a charge as outgoing", () => {
    expect(directionText(1200)).toBe("זיכוי נכנס");
    expect(directionText(-1200)).toBe("חיוב יוצא");
  });

  it("names a zero amount as incoming, as the money colours treat zero", () => {
    expect(directionText(0)).toBe("זיכוי נכנס");
  });
});

describe("the match confidence, in words", () => {
  it("rounds the score to a whole percentage", () => {
    expect(confidenceText(0.954)).toBe("ביטחון 95%");
    expect(confidenceText(0.5)).toBe("ביטחון 50%");
  });
});

describe("what approving a suspected transfer will do, in words", () => {
  it("tells an incoming row it leaves income", () => {
    expect(suspectedTransferConsequence(member("transfer_pair", 12000))).toBe(
      "לא נמצא צד שני להעברה. אישור יסמן את התנועה כהעברה פנימית, ולכן היא לא תיספר בהכנסות.",
    );
  });

  it("treats a zero amount as not a credit, as routing and bulk approve do", () => {
    expect(suspectedTransferConsequence(member("transfer_pair", 0))).toContain("בהוצאות");
  });

  it("tells a user-sourced row whose category was deleted that approving leaves it as it is", () => {
    const row = { ...member("transfer_pair", 12000), categorySource: "user" as const };
    expect(suspectedTransferConsequence(row)).toBe(
      "התנועה סווגה בעבר באופן ידני. אישור לא ישנה את הסיווג שלה.",
    );
  });

  it("tells an outgoing row it leaves expenses", () => {
    expect(suspectedTransferConsequence(member("transfer_pair", -800))).toBe(
      "לא נמצא צד שני להעברה. אישור יסמן את התנועה כהעברה פנימית, ולכן היא לא תיספר בהוצאות.",
    );
  });

  it.each(["user", "memory"] as const)(
    "tells a row categorized by the user (%s) that approving keeps its category",
    (categorySource) => {
      const row = { ...member("transfer_pair", 12000), categoryName: "משכורת", categorySource };
      expect(suspectedTransferConsequence(row)).toBe(
        "התנועה כבר מסווגת כ״משכורת״. אישור ישאיר את הסיווג הזה.",
      );
    },
  );
});

describe("which groups bulk approve may sweep in", () => {
  it("leaves out a suspected transfer that is incoming", () => {
    expect(isBulkApprovable(reconciliationGroupView([member("transfer_pair", 12000)]))).toBe(false);
  });

  it("includes a zero-amount suspected transfer, which is not a credit", () => {
    expect(isBulkApprovable(reconciliationGroupView([member("transfer_pair", 0)]))).toBe(true);
  });

  it("includes an outgoing suspected transfer and every two-sided match", () => {
    expect(isBulkApprovable(reconciliationGroupView([member("transfer_pair", -800)]))).toBe(true);
    expect(
      isBulkApprovable(
        reconciliationGroupView([member("transfer_pair", -800), member("transfer_pair", 800)]),
      ),
    ).toBe(true);
  });
});
