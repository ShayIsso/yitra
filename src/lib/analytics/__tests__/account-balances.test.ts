import { describe, it, expect } from "vitest";
import { projectAccountBalances, type NextDebitTransaction } from "../index";
import { bankKindOf, type BankKind, type BankType } from "@/lib/bank-registry";

// Ids no registry entry carries. Account rows are typed by the registered union,
// so the ids are widened through `string`; the resolver below is the only thing
// that gives them a kind, standing in for a future registry entry.
const EXTRA_CARD = "hypothetical-card-issuer" as string as BankType;
const EXTRA_BANK = "hypothetical-account-bank" as string as BankType;

function withHypotheticalInstitutions(id: string): BankKind | undefined {
  if (id === EXTRA_CARD) return "card";
  if (id === EXTRA_BANK) return "bank";
  return bankKindOf(id);
}

const TODAY = "2026-07-13";

function account(id: string, bankType: BankType, balance: number | null) {
  return { id, accountNumber: `acct-${id}`, balance, bankType, displayName: `account ${id}` };
}

const UPCOMING: ReadonlyMap<string, NextDebitTransaction[]> = new Map([
  [
    "a1",
    [
      { processedDate: "2026-08-02", chargedAmount: -120 },
      { processedDate: "2026-08-02", chargedAmount: -80 },
    ],
  ],
]);

describe("projectAccountBalances — the next-debit estimate follows registry kind", () => {
  it("replaces the reported balance of an account at a card institution added to the registry", () => {
    const [projected] = projectAccountBalances(
      [account("a1", EXTRA_CARD, 4321)],
      UPCOMING,
      TODAY,
      withHypotheticalInstitutions,
    );

    expect(projected.balance).toBe(-200);
    expect(projected.nextDebitDate).toBe("2026-08-02");
  });

  it("keeps the reported balance of an account at a bank institution added to the registry", () => {
    const [projected] = projectAccountBalances(
      [account("a1", EXTRA_BANK, 4321)],
      UPCOMING,
      TODAY,
      withHypotheticalInstitutions,
    );

    expect(projected.balance).toBe(4321);
    expect(projected.nextDebitDate).toBeNull();
  });

  it("keeps the reported balance of an account at an institution of unknown kind", () => {
    const unknown = "institution-with-no-entry" as string as BankType;

    const [projected] = projectAccountBalances(
      [account("a1", unknown, 4321)],
      UPCOMING,
      TODAY,
      withHypotheticalInstitutions,
    );

    expect(projected.balance).toBe(4321);
    expect(projected.nextDebitDate).toBeNull();
  });

  it("estimates zero with no hint date for a card account with nothing upcoming", () => {
    const [projected] = projectAccountBalances(
      [account("a2", EXTRA_CARD, 4321)],
      UPCOMING,
      TODAY,
      withHypotheticalInstitutions,
    );

    expect(projected).toEqual({
      id: "a2",
      accountNumber: "acct-a2",
      balance: 0,
      bankType: EXTRA_CARD,
      displayName: "account a2",
      nextDebitDate: null,
    });
  });
});
