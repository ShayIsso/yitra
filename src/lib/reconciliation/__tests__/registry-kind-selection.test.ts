import { describe, it, expect, vi } from "vitest";
import { detectP1Settlement } from "../detect-p1";
import { identifyBankSide, type InboxTransaction } from "../inbox-ops";
import type { ReconciliationTransaction } from "../types";
import {
  HYPOTHETICAL_BANK,
  HYPOTHETICAL_CARD,
  HYPOTHETICAL_PREPAID,
  UNREGISTERED,
} from "@/lib/bank-registry/__tests__/hypothetical-institutions";

vi.mock("@/lib/bank-registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bank-registry")>();
  const { withHypotheticalInstitutions } =
    await import("@/lib/bank-registry/__tests__/hypothetical-institutions");
  return { ...actual, bankKindOf: withHypotheticalInstitutions(actual.bankKindOf) };
});

let idCounter = 0;
function tx(overrides: Partial<ReconciliationTransaction> = {}): ReconciliationTransaction {
  idCounter++;
  return {
    id: `tx-${idCounter}`,
    bankAccountId: `ba-${idCounter}`,
    bankType: "discount",
    date: "2026-01-15",
    chargedAmount: -300,
    description: "חיוב ויזה",
    categoryId: null,
    reconciliationGroupId: null,
    ...overrides,
  };
}

describe("detectP1Settlement — institution selection follows registry kind", () => {
  it("matches a bank lump against card rows from a card institution added to the registry", () => {
    const lump = tx({ description: "חיוב ויזה", chargedAmount: -300 });
    const card1 = tx({ bankType: HYPOTHETICAL_CARD, description: "קפה", chargedAmount: -100 });
    const card2 = tx({ bankType: HYPOTHETICAL_CARD, description: "מסעדה", chargedAmount: -200 });

    const result = detectP1Settlement([lump, card1, card2]);

    expect(result).toHaveLength(1);
    expect(result[0].bankLump.id).toBe(lump.id);
    expect(result[0].cardDetails.map((c) => c.id)).toEqual(
      expect.arrayContaining([card1.id, card2.id]),
    );
  });

  it("takes the settlement lump from a bank institution added to the registry", () => {
    const lump = tx({ bankType: HYPOTHETICAL_BANK, description: "חיוב ויזה", chargedAmount: -300 });
    const card = tx({ bankType: "max", description: "קפה", chargedAmount: -300 });

    const result = detectP1Settlement([lump, card]);

    expect(result).toHaveLength(1);
    expect(result[0].bankLump.id).toBe(lump.id);
  });

  it("never matches a bank lump against rows from a prepaid institution added to the registry", () => {
    const lump = tx({ description: "חיוב ויזה", chargedAmount: -300 });
    const prepaid = tx({ bankType: HYPOTHETICAL_PREPAID, description: "קפה", chargedAmount: -300 });

    expect(detectP1Settlement([lump, prepaid])).toEqual([]);
  });

  it("never takes a settlement lump from a prepaid institution added to the registry", () => {
    const lump = tx({
      bankType: HYPOTHETICAL_PREPAID,
      description: "חיוב ויזה",
      chargedAmount: -300,
    });
    const card = tx({ bankType: "max", description: "קפה", chargedAmount: -300 });

    expect(detectP1Settlement([lump, card])).toEqual([]);
  });

  it("never treats rows from an institution of unknown kind as either side", () => {
    const lump = tx({ bankType: UNREGISTERED, description: "חיוב ויזה", chargedAmount: -300 });
    const card = tx({ bankType: UNREGISTERED, description: "קפה", chargedAmount: -300 });

    expect(detectP1Settlement([lump, card])).toEqual([]);
  });
});

function pairMember(overrides: Partial<InboxTransaction>): InboxTransaction {
  return {
    id: "member",
    bankAccountId: "ba-member",
    bankType: "discount",
    date: "2026-01-15",
    description: "העברה",
    chargedAmount: -300,
    categoryId: null,
    reconciliationGroupId: "group-1",
    reconciliationRole: "transfer_pair",
    reconciliationConfidence: 0.9,
    reconciliationConfirmedAt: null,
    createdAt: new Date("2026-01-15T10:00:00Z"),
    ...overrides,
  };
}

describe("identifyBankSide — the unmarked tiebreak follows registry kind", () => {
  it("picks the row from a bank institution added to the registry over a card row", () => {
    const cardRow = pairMember({
      id: "card-row",
      bankType: "max",
      createdAt: new Date("2026-01-15T09:00:00Z"),
    });
    const bankRow = pairMember({
      id: "bank-row",
      bankType: HYPOTHETICAL_BANK,
      createdAt: new Date("2026-01-15T11:00:00Z"),
    });

    expect(identifyBankSide([cardRow, bankRow])?.id).toBe("bank-row");
  });

  it("picks the bank row over a row from a card institution added to the registry", () => {
    const cardRow = pairMember({
      id: "card-row",
      bankType: HYPOTHETICAL_CARD,
      createdAt: new Date("2026-01-15T09:00:00Z"),
    });
    const bankRow = pairMember({
      id: "bank-row",
      bankType: "discount",
      createdAt: new Date("2026-01-15T11:00:00Z"),
    });

    expect(identifyBankSide([cardRow, bankRow])?.id).toBe("bank-row");
  });

  it("picks the bank row over a row from a prepaid institution added to the registry", () => {
    const prepaidRow = pairMember({
      id: "prepaid-row",
      bankType: HYPOTHETICAL_PREPAID,
      createdAt: new Date("2026-01-15T09:00:00Z"),
    });
    const bankRow = pairMember({
      id: "bank-row",
      bankType: "discount",
      createdAt: new Date("2026-01-15T11:00:00Z"),
    });

    expect(identifyBankSide([prepaidRow, bankRow])?.id).toBe("bank-row");
  });

  it("falls back to the earlier row when a prepaid and a card row meet, neither being a bank", () => {
    const later = pairMember({
      id: "later",
      bankType: HYPOTHETICAL_PREPAID,
      createdAt: new Date("2026-01-15T11:00:00Z"),
    });
    const earlier = pairMember({
      id: "earlier",
      bankType: HYPOTHETICAL_CARD,
      createdAt: new Date("2026-01-15T09:00:00Z"),
    });

    expect(identifyBankSide([later, earlier])?.id).toBe("earlier");
  });

  it("falls back to the earlier row when both sides are of the same kind", () => {
    const later = pairMember({
      id: "later",
      bankType: "discount",
      createdAt: new Date("2026-01-15T11:00:00Z"),
    });
    const earlier = pairMember({
      id: "earlier",
      bankType: HYPOTHETICAL_BANK,
      createdAt: new Date("2026-01-15T09:00:00Z"),
    });

    expect(identifyBankSide([later, earlier])?.id).toBe("earlier");
  });
});
