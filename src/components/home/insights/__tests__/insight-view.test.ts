import { describe, it, expect } from "vitest";
import type { CardDebitFact, Insight } from "@/lib/analytics/insights";
import {
  cardDebitLines,
  insightHref,
  isAttentionInsight,
} from "@/components/home/insights/insight-view";

// All names and figures invented.
const NOVEMBER = { year: 2026, month: 11 };

function card(over: Partial<CardDebitFact> = {}): CardDebitFact {
  return {
    accountId: "acc-1",
    displayName: "כרטיס לדוגמה",
    amount: 1800,
    date: "2026-11-10",
    ...over,
  };
}

function budget(verdict: "over" | "at-risk", categoryId = "cat-food") {
  return { budgetId: "b-1", categoryId, categoryName: "מזון", verdict, spent: 900, limit: 800 };
}

describe("insightHref", () => {
  it("opens the transactions already filtered to uncategorized rows", () => {
    expect(insightHref({ kind: "uncategorized", count: 4 }, NOVEMBER)).toBe(
      "/transactions?uncategorized=true",
    );
  });

  it("opens the AI suggestions awaiting review", () => {
    expect(insightHref({ kind: "needs-review", count: 2 }, NOVEMBER)).toBe(
      "/transactions?needsReview=true",
    );
  });

  it("opens the riskiest budget's category for the month", () => {
    const insight: Insight = {
      kind: "budget-risk",
      budgets: [budget("over", "cat-first"), budget("at-risk", "cat-second")],
    };
    expect(insightHref(insight, NOVEMBER)).toBe("/transactions?categoryId=cat-first&month=2026-11");
  });

  it("opens the jumping category for the month", () => {
    const insight: Insight = {
      kind: "category-jump",
      categoryId: "cat-fun",
      name: "פנאי",
      color: "#336699",
      icon: "Clapperboard",
      amount: 700,
      previous: 300,
      change: 400,
    };
    expect(insightHref(insight, NOVEMBER)).toBe("/transactions?categoryId=cat-fun&month=2026-11");
  });

  it("opens the day the biggest expense was charged", () => {
    const insight: Insight = {
      kind: "biggest-expense",
      transactionId: "tx-1",
      description: "חנות לדוגמה",
      amount: 2400,
      date: "2026-11-04",
      categoryId: null,
      categoryName: null,
    };
    expect(insightHref(insight, NOVEMBER)).toBe(
      "/transactions?dateFrom=2026-11-04&dateTo=2026-11-04",
    );
  });

  it("opens the subscriptions for the recurring bills still due", () => {
    expect(insightHref({ kind: "upcoming-recurring", total: 90, charges: [] }, NOVEMBER)).toBe(
      "/subscriptions",
    );
  });

  it("links nowhere for the card debit, which has no view of its own", () => {
    const insight: Insight = {
      kind: "card-debit",
      total: 1800,
      date: "2026-11-10",
      cards: [card()],
    };
    expect(insightHref(insight, NOVEMBER)).toBeNull();
  });
});

describe("isAttentionInsight", () => {
  it("marks budgets over or at risk as attention", () => {
    expect(isAttentionInsight({ kind: "budget-risk", budgets: [budget("at-risk")] })).toBe(true);
  });

  it("keeps every other card calm", () => {
    expect(isAttentionInsight({ kind: "uncategorized", count: 3 })).toBe(false);
    expect(
      isAttentionInsight({ kind: "card-debit", total: 1, date: "2026-11-10", cards: [card()] }),
    ).toBe(false);
  });
});

describe("cardDebitLines", () => {
  it("lists every card with its own charge date", () => {
    const lines = cardDebitLines([
      card({ accountId: "a", displayName: "כרטיס א", date: "2026-11-02", amount: 500 }),
      card({ accountId: "b", displayName: "כרטיס ב", date: "2026-11-15", amount: 900 }),
    ]);
    expect(lines).toEqual({
      shown: [
        { accountId: "a", displayName: "כרטיס א", date: "2026-11-02", amount: 500 },
        { accountId: "b", displayName: "כרטיס ב", date: "2026-11-15", amount: 900 },
      ],
      more: 0,
    });
  });

  it("folds cards past the second into a count", () => {
    const lines = cardDebitLines([
      card({ accountId: "a" }),
      card({ accountId: "b" }),
      card({ accountId: "c" }),
      card({ accountId: "d" }),
    ]);
    expect(lines.shown.map((c) => c.accountId)).toEqual(["a", "b"]);
    expect(lines.more).toBe(2);
  });
});
