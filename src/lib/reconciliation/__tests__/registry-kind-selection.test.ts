import { describe, it, expect } from "vitest";
import { detectP1Settlement } from "../detect-p1";
import { identifyBankSide, type InboxTransaction } from "../inbox-ops";
import type { ReconciliationTransaction } from "../types";
import { bankKindOf, type BankKind, type BankType } from "@/lib/bank-registry";

// Ids no registry entry carries. Consumer rows are typed by the registered union,
// so the ids are widened through `string`; the resolver below is the only thing
// that gives them a kind, standing in for a future registry entry.
const EXTRA_CARD = "hypothetical-card-issuer" as string as BankType;
const EXTRA_BANK = "hypothetical-account-bank" as string as BankType;

function withHypotheticalInstitutions(id: string): BankKind | undefined {
  if (id === EXTRA_CARD) return "card";
  if (id === EXTRA_BANK) return "bank";
  return bankKindOf(id);
}

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
    const card1 = tx({ bankType: EXTRA_CARD, description: "קפה", chargedAmount: -100 });
    const card2 = tx({ bankType: EXTRA_CARD, description: "מסעדה", chargedAmount: -200 });

    const result = detectP1Settlement([lump, card1, card2], withHypotheticalInstitutions);

    expect(result).toHaveLength(1);
    expect(result[0].bankLump.id).toBe(lump.id);
    expect(result[0].cardDetails.map((c) => c.id)).toEqual(
      expect.arrayContaining([card1.id, card2.id]),
    );
  });

  it("takes the settlement lump from a bank institution added to the registry", () => {
    const lump = tx({ bankType: EXTRA_BANK, description: "חיוב ויזה", chargedAmount: -300 });
    const card = tx({ bankType: "max", description: "קפה", chargedAmount: -300 });

    const result = detectP1Settlement([lump, card], withHypotheticalInstitutions);

    expect(result).toHaveLength(1);
    expect(result[0].bankLump.id).toBe(lump.id);
  });

  it("never treats rows from an institution of unknown kind as either side", () => {
    const unknown = "institution-with-no-entry" as string as BankType;
    const lump = tx({ bankType: unknown, description: "חיוב ויזה", chargedAmount: -300 });
    const card = tx({ bankType: unknown, description: "קפה", chargedAmount: -300 });

    expect(detectP1Settlement([lump, card], withHypotheticalInstitutions)).toEqual([]);
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
      bankType: EXTRA_BANK,
      createdAt: new Date("2026-01-15T11:00:00Z"),
    });

    expect(identifyBankSide([cardRow, bankRow], withHypotheticalInstitutions)?.id).toBe("bank-row");
  });

  it("picks the bank row over a row from a card institution added to the registry", () => {
    const cardRow = pairMember({
      id: "card-row",
      bankType: EXTRA_CARD,
      createdAt: new Date("2026-01-15T09:00:00Z"),
    });
    const bankRow = pairMember({
      id: "bank-row",
      bankType: "discount",
      createdAt: new Date("2026-01-15T11:00:00Z"),
    });

    expect(identifyBankSide([cardRow, bankRow], withHypotheticalInstitutions)?.id).toBe("bank-row");
  });

  it("falls back to the earlier row when both sides are of the same kind", () => {
    const later = pairMember({
      id: "later",
      bankType: "discount",
      createdAt: new Date("2026-01-15T11:00:00Z"),
    });
    const earlier = pairMember({
      id: "earlier",
      bankType: EXTRA_BANK,
      createdAt: new Date("2026-01-15T09:00:00Z"),
    });

    expect(identifyBankSide([later, earlier], withHypotheticalInstitutions)?.id).toBe("earlier");
  });
});
