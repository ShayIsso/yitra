import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReconciliationInbox } from "@/components/reconciliation-inbox";
import type { PendingGroup, PendingMember } from "@/components/reconciliation-group-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

vi.mock("@/app/actions/reconciliation", () => ({
  approveReconciliationAction: vi.fn(),
  rejectReconciliationAction: vi.fn(),
  approveReconciliationsAction: vi.fn(),
  rejectReconciliationsAction: vi.fn(),
}));

function suspected(groupId: string, chargedAmount: number): PendingGroup {
  const row: PendingMember = {
    id: `tx-${groupId}`,
    bankType: "discount",
    credentialDisplayName: "Synthetic account",
    date: "2026-03-10",
    description: chargedAmount > 0 ? 'העברה מחברה לדוגמה בע"מ' : "העברה לחשבון שלי",
    chargedAmount,
    categoryName: null,
    categorySource: null,
    reconciliationRole: "transfer_pair",
  };
  return { groupId, confidence: 0.5, members: [row] };
}

const render = (groups: PendingGroup[]) =>
  renderToStaticMarkup(createElement(ReconciliationInbox, { groups }));

describe("the inbox's bulk toolbar", () => {
  it("is not offered when every pending group is an incoming suspected transfer", () => {
    const html = render([suspected("a", 12000), suspected("b", 9000)]);

    expect(html).not.toContain("בחר הכל");
    expect(html).not.toContain("אשר נבחרים");
  });

  it("is offered once any group can be bulk-approved", () => {
    const html = render([suspected("a", 12000), suspected("b", -800)]);

    expect(html).toContain("בחר הכל");
    expect(html).toContain("אשר נבחרים");
  });
});
