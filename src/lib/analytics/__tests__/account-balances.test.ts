import { describe, it, expect, vi } from "vitest";
import {
  projectAccountBalances,
  type NextDebitTransaction,
  type ReportedAccountBalance,
} from "../index";
import type { BankType } from "@/lib/bank-registry";
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

const TODAY = "2026-07-13";

function account(id: string, bankType: BankType, balance: number | null): ReportedAccountBalance {
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
  ["a2", [{ processedDate: "2026-07-20", chargedAmount: -45 }]],
  ["a3", [{ processedDate: "2026-07-25", chargedAmount: -60 }]],
]);

describe("projectAccountBalances — registered institutions", () => {
  it("substitutes the next-debit estimate for both card issuers and keeps the bank's reported balance", () => {
    const projected = projectAccountBalances(
      [account("a1", "max", 4321), account("a2", "visaCal", null), account("a3", "discount", 987)],
      UPCOMING,
      TODAY,
    );

    expect(projected).toEqual([
      {
        id: "a1",
        accountNumber: "acct-a1",
        balance: -200,
        bankType: "max",
        displayName: "account a1",
        nextDebitDate: "2026-08-02",
      },
      {
        id: "a2",
        accountNumber: "acct-a2",
        balance: -45,
        bankType: "visaCal",
        displayName: "account a2",
        nextDebitDate: "2026-07-20",
      },
      {
        id: "a3",
        accountNumber: "acct-a3",
        balance: 987,
        bankType: "discount",
        displayName: "account a3",
        nextDebitDate: null,
      },
    ]);
  });

  it("keeps the reported balance of a registered prepaid institution", () => {
    const [projected] = projectAccountBalances(
      [account("a1", "beyahadBishvilha", 250)],
      UPCOMING,
      TODAY,
    );

    expect(projected.balance).toBe(250);
    expect(projected.nextDebitDate).toBeNull();
  });

  it("emits only the account-balance fields, whatever else the input row carries", () => {
    const row = { ...account("a3", "discount", 987), internalNote: "not-for-the-client" };

    const [projected] = projectAccountBalances([row], UPCOMING, TODAY);

    expect(Object.keys(projected)).toEqual([
      "id",
      "accountNumber",
      "balance",
      "bankType",
      "displayName",
      "nextDebitDate",
    ]);
  });
});

describe("projectAccountBalances — an institution added to the registry", () => {
  it("replaces the reported balance of an account at a new card institution", () => {
    const [projected] = projectAccountBalances(
      [account("a1", HYPOTHETICAL_CARD, 4321)],
      UPCOMING,
      TODAY,
    );

    expect(projected.balance).toBe(-200);
    expect(projected.nextDebitDate).toBe("2026-08-02");
  });

  it("estimates zero with no hint date for a new card institution's account with nothing upcoming", () => {
    const [projected] = projectAccountBalances(
      [account("a9", HYPOTHETICAL_CARD, 4321)],
      UPCOMING,
      TODAY,
    );

    expect(projected.balance).toBe(0);
    expect(projected.nextDebitDate).toBeNull();
  });

  it("keeps the reported balance of an account at a new bank institution", () => {
    const [projected] = projectAccountBalances(
      [account("a1", HYPOTHETICAL_BANK, 4321)],
      UPCOMING,
      TODAY,
    );

    expect(projected.balance).toBe(4321);
    expect(projected.nextDebitDate).toBeNull();
  });

  it("keeps the reported balance of an account at a new prepaid institution, however much is upcoming", () => {
    const [projected] = projectAccountBalances(
      [account("a1", HYPOTHETICAL_PREPAID, 4321)],
      UPCOMING,
      TODAY,
    );

    expect(projected.balance).toBe(4321);
    expect(projected.nextDebitDate).toBeNull();
  });

  it("keeps the reported balance of an account at an institution of unknown kind", () => {
    const [projected] = projectAccountBalances(
      [account("a1", UNREGISTERED, 4321)],
      UPCOMING,
      TODAY,
    );

    expect(projected.balance).toBe(4321);
    expect(projected.nextDebitDate).toBeNull();
  });
});
