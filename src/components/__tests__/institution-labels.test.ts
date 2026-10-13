import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { enabledBankEntries } from "@/lib/bank-registry";
import { BankBadge } from "@/components/bank-badge";
import { SyncPanel } from "@/components/sync-panel";
import { ReconciliationInbox } from "@/components/reconciliation-inbox";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/actions/reconciliation", () => ({
  approveReconciliationAction: vi.fn(),
  rejectReconciliationAction: vi.fn(),
  approveReconciliationsAction: vi.fn(),
  rejectReconciliationsAction: vi.fn(),
}));

const UNREGISTERED_ID = "retiredInstitution";
const UNKNOWN_LABEL = "מוסד לא ידוע";

describe("BankBadge", () => {
  it("renders every selectable institution under its registry Hebrew name", () => {
    for (const entry of enabledBankEntries()) {
      const html = renderToStaticMarkup(createElement(BankBadge, { bankType: entry.id }));
      expect(html).toContain(entry.nameHe);
      expect(html).not.toContain(entry.nameEn);
    }
  });

  it("renders an unregistered stored id as the readable unknown-institution label, never the raw id", () => {
    const html = renderToStaticMarkup(createElement(BankBadge, { bankType: UNREGISTERED_ID }));
    expect(html).toContain(UNKNOWN_LABEL);
    expect(html).not.toContain(UNREGISTERED_ID);
  });
});

describe("SyncPanel institution labels", () => {
  it("names a bank row with an unregistered stored id as an unknown institution, not by its raw id", () => {
    const html = renderToStaticMarkup(
      createElement(SyncPanel, {
        banks: [{ id: "cred-1", bankType: UNREGISTERED_ID, displayName: "Synthetic account" }],
        lastRuns: [],
      }),
    );
    expect(html).toContain(UNKNOWN_LABEL);
    expect(html).not.toContain(UNREGISTERED_ID);
  });
});

describe("ReconciliationInbox institution labels", () => {
  function transferPairMember(id: string, chargedAmount: number) {
    return {
      id,
      bankType: UNREGISTERED_ID,
      credentialDisplayName: "Synthetic account",
      date: "2026-01-15",
      description: "Synthetic transfer",
      chargedAmount,
      categoryName: null,
      reconciliationRole: "transfer_pair" as const,
    };
  }

  it("names both sides of a transfer pair from unregistered institutions as unknown, not by raw id", () => {
    const html = renderToStaticMarkup(
      createElement(ReconciliationInbox, {
        groups: [
          {
            groupId: "group-1",
            confidence: 0.95,
            members: [transferPairMember("tx-1", -500), transferPairMember("tx-2", 500)],
          },
        ],
      }),
    );
    expect(html).toContain(`ב${UNKNOWN_LABEL}`);
    expect(html).not.toContain(UNREGISTERED_ID);
  });
});
