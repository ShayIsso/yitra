import { describe, it, expect } from "vitest";
import {
  selectInsights,
  isMonthOverMonthChangeVisible,
  areQuietCategoriesVisible,
  previousMonth,
  type InsightFacts,
} from "../index";

const recap: InsightFacts["recap"] = {
  month: { year: 2026, month: 2 },
  income: 10000,
  expenses: 7000,
  netSavings: 3000,
  savingsRate: 30,
  topCategory: { categoryId: "c1", name: "מזון", color: "#111111", amount: 2000, share: 0.4 },
  biggestChange: { categoryId: "c1", name: "מזון", amount: 2000, previous: 1500 },
  mostExpensiveDay: { date: "2026-02-12", amount: 900, topDescription: "חנות לדוגמה" },
  recurring: { count: 3, monthlyTotal: 250 },
  verdict: { target: 8000, over: false, by: 1000 },
};

const groceries = { categoryId: "c1", name: "מזון", color: "#111111", icon: "Apple" };

function charge(
  id: string,
  amount: number,
  date: string,
  lastChargeDate: string,
  cadence: "monthly" | "quarterly" | "annual" = "monthly",
) {
  return { id, name: `מנוי ${id}`, amount, date, lastChargeDate, cadence };
}

function everything(): Partial<InsightFacts> {
  return {
    cardDebits: [{ accountId: "a1", displayName: "כרטיס א", amount: 1200, date: "2026-03-20" }],
    attention: { uncategorized: 4, needsReview: 2 },
    budgets: [
      {
        budgetId: "b1",
        categoryId: "c2",
        categoryName: "מסעדות",
        verdict: "at-risk",
        spent: 450,
        limit: 500,
      },
    ],
    upcomingRecurring: [charge("r1", 50, "2026-03-18", "2026-02-16")],
    categoryChanges: [{ ...groceries, amount: 900, previous: 400 }],
    biggestExpense: {
      transactionId: "t1",
      description: "חנות רהיטים לדוגמה",
      amount: 1500,
      date: "2026-03-04",
      categoryId: "c3",
      categoryName: "בית",
    },
    recap,
  };
}

function facts(overrides: Partial<InsightFacts> = {}): InsightFacts {
  return {
    month: { year: 2026, month: 3 },
    today: "2026-03-15",
    cardDebits: [],
    attention: { uncategorized: 0, needsReview: 0 },
    budgets: [],
    upcomingRecurring: [],
    categoryChanges: [],
    biggestExpense: null,
    recap: null,
    ...overrides,
  };
}

describe("selectInsights", () => {
  it("returns an empty list when there is nothing to say", () => {
    expect(selectInsights(facts())).toEqual([]);
  });

  it("totals the upcoming card debits, to the agora, into one card dated by the earliest debit", () => {
    const insights = selectInsights(
      facts({
        cardDebits: [
          { accountId: "a2", displayName: "כרטיס ב", amount: 200.2, date: "2026-03-20" },
          { accountId: "a1", displayName: "כרטיס א", amount: 100.1, date: "2026-03-10" },
        ],
      }),
    );
    expect(insights).toEqual([
      {
        kind: "card-debit",
        total: 300.3,
        date: "2026-03-10",
        cards: [
          { accountId: "a1", displayName: "כרטיס א", amount: 100.1, date: "2026-03-10" },
          { accountId: "a2", displayName: "כרטיס ב", amount: 200.2, date: "2026-03-20" },
        ],
      },
    ]);
  });

  it("orders cards by actionability: card debit first, then items to act on, recap last", () => {
    expect(selectInsights(facts(everything())).map((i) => i.kind)).toEqual([
      "card-debit",
      "uncategorized",
      "needs-review",
      "budget-risk",
      "upcoming-recurring",
      "category-jump",
      "biggest-expense",
      "recap",
    ]);
  });

  it("keeps the recap last for a closed month", () => {
    const insights = selectInsights(facts({ ...everything(), today: "2026-05-02" }));
    expect(insights.map((i) => i.kind)).toEqual([
      "uncategorized",
      "needs-review",
      "category-jump",
      "biggest-expense",
      "recap",
    ]);
  });

  describe("category jump", () => {
    const changes = [
      { ...groceries, amount: 900, previous: 400 },
      {
        categoryId: "c4",
        name: "תחבורה",
        color: "#222222",
        icon: "Car",
        amount: 1300,
        previous: 500,
      },
      {
        categoryId: "c5",
        name: "ביגוד",
        color: "#333333",
        icon: "Shirt",
        amount: 600,
        previous: 0,
      },
      {
        categoryId: "c6",
        name: "פנאי",
        color: "#444444",
        icon: "Music",
        amount: 450,
        previous: 380,
      },
    ];

    it("picks the category that rose most against last month", () => {
      const jump = selectInsights(facts({ categoryChanges: changes })).find(
        (i) => i.kind === "category-jump",
      );
      expect(jump).toEqual({
        kind: "category-jump",
        categoryId: "c4",
        name: "תחבורה",
        color: "#222222",
        icon: "Car",
        amount: 1300,
        previous: 500,
        change: 800,
      });
    });

    it("ignores rises under ₪100 and categories with no spend last month", () => {
      const insights = selectInsights(facts({ categoryChanges: [changes[2], changes[3]] }));
      expect(insights).toEqual([]);
    });

    it("counts a rise of exactly ₪100 despite float residue", () => {
      const [jump] = selectInsights(
        facts({ categoryChanges: [{ ...groceries, amount: 128.01, previous: 28.01 }] }),
      );
      expect(jump).toMatchObject({ kind: "category-jump", change: 100 });
    });

    it("is hidden before day 7 of the current month", () => {
      expect(selectInsights(facts({ today: "2026-03-06", categoryChanges: changes }))).toEqual([]);
      expect(
        selectInsights(facts({ today: "2026-03-07", categoryChanges: changes })).map((i) => i.kind),
      ).toEqual(["category-jump"]);
    });
  });

  describe("upcoming recurring", () => {
    it("lists charges still due this month, late ones included, earliest first", () => {
      const insight = selectInsights(
        facts({
          upcomingRecurring: [
            charge("r3", 200, "2026-03-28", "2025-12-28", "quarterly"),
            charge("r4", 300, "2026-04-02", "2025-04-02", "annual"),
            charge("r1", 50, "2026-03-12", "2026-02-10"),
            charge("r2", 150, "2026-03-15", "2026-02-13"),
          ],
        }),
      );
      expect(insight).toEqual([
        {
          kind: "upcoming-recurring",
          total: 400,
          charges: [
            charge("r1", 50, "2026-03-12", "2026-02-10"),
            charge("r2", 150, "2026-03-15", "2026-02-13"),
            charge("r3", 200, "2026-03-28", "2025-12-28", "quarterly"),
          ],
        },
      ]);
    });

    it("leaves out a series already charged this month, though its projection lands in it", () => {
      const insights = selectInsights(
        facts({ upcomingRecurring: [charge("r1", 50, "2026-03-31", "2026-03-01")] }),
      );
      expect(insights).toEqual([]);
    });

    it("counts a monthly series not yet charged this month even when its projection falls just after it", () => {
      const insights = selectInsights(
        facts({
          month: { year: 2026, month: 2 },
          today: "2026-02-10",
          upcomingRecurring: [charge("r1", 50, "2026-03-02", "2026-01-31")],
        }),
      );
      expect(insights).toEqual([
        {
          kind: "upcoming-recurring",
          total: 50,
          charges: [charge("r1", 50, "2026-03-02", "2026-01-31")],
        },
      ]);
    });

    it("leaves out a longer-cadence series projected after the month", () => {
      const insights = selectInsights(
        facts({
          upcomingRecurring: [charge("r1", 300, "2026-04-02", "2026-01-02", "quarterly")],
        }),
      );
      expect(insights).toEqual([]);
    });
  });

  it("shows nothing at all for a month that has not started, attention included", () => {
    const insights = selectInsights(
      facts({ ...everything(), month: { year: 2026, month: 4 }, recap: null }),
    );
    expect(insights).toEqual([]);
  });

  it("orders zero-limit over-budget categories stably among themselves", () => {
    const zero = (budgetId: string) => ({
      budgetId,
      categoryId: `c-${budgetId}`,
      categoryName: `קטגוריה ${budgetId}`,
      verdict: "over" as const,
      spent: 50,
      limit: 0,
    });
    const [insight] = selectInsights(facts({ budgets: [zero("b1"), zero("b2"), zero("b3")] }));
    expect(insight.kind === "budget-risk" && insight.budgets.map((b) => b.budgetId)).toEqual([
      "b1",
      "b2",
      "b3",
    ]);
  });

  it("lists over-budget categories before at-risk ones, the most spent first, and skips calm ones", () => {
    const budget = (budgetId: string, verdict: string, spent: number, limit: number) => ({
      budgetId,
      categoryId: `c-${budgetId}`,
      categoryName: `קטגוריה ${budgetId}`,
      verdict: verdict as "over" | "at-risk" | "on-pace" | "comfortably-under",
      spent,
      limit,
    });
    const [insight] = selectInsights(
      facts({
        budgets: [
          budget("b1", "at-risk", 450, 500),
          budget("b2", "on-pace", 100, 500),
          budget("b3", "over", 520, 500),
          budget("b4", "at-risk", 380, 400),
          budget("b5", "comfortably-under", 10, 500),
          budget("b6", "over", 50, 0),
        ],
      }),
    );
    expect(insight.kind === "budget-risk" && insight.budgets.map((b) => b.budgetId)).toEqual([
      "b6",
      "b3",
      "b4",
      "b1",
    ]);
  });

  it("shows no upcoming or at-risk cards for a closed month", () => {
    const insights = selectInsights(
      facts({
        today: "2026-04-03",
        cardDebits: [{ accountId: "a1", displayName: "כרטיס א", amount: 800, date: "2026-04-10" }],
        upcomingRecurring: [charge("r1", 50, "2026-04-05", "2026-03-06")],
        budgets: [
          {
            budgetId: "b1",
            categoryId: "c1",
            categoryName: "מסעדות",
            verdict: "over",
            spent: 700,
            limit: 500,
          },
        ],
      }),
    );
    expect(insights).toEqual([]);
  });
});

describe("previousMonth", () => {
  it("steps back one calendar month, across the year boundary", () => {
    expect(previousMonth({ year: 2026, month: 3 })).toEqual({ year: 2026, month: 2 });
    expect(previousMonth({ year: 2026, month: 1 })).toEqual({ year: 2025, month: 12 });
  });
});

describe("isMonthOverMonthChangeVisible", () => {
  const march = { year: 2026, month: 3 };

  it("hides the change through day 6 of the current month and shows it from day 7", () => {
    expect(isMonthOverMonthChangeVisible(march, "2026-03-01")).toBe(false);
    expect(isMonthOverMonthChangeVisible(march, "2026-03-06")).toBe(false);
    expect(isMonthOverMonthChangeVisible(march, "2026-03-07")).toBe(true);
    expect(isMonthOverMonthChangeVisible(march, "2026-03-31")).toBe(true);
  });

  it("always shows the change for a closed month, whatever today's day", () => {
    expect(isMonthOverMonthChangeVisible(march, "2026-04-02")).toBe(true);
    expect(isMonthOverMonthChangeVisible(march, "2027-01-01")).toBe(true);
  });

  it("never shows a change for a month that has not started", () => {
    expect(isMonthOverMonthChangeVisible(march, "2026-02-27")).toBe(false);
  });
});

describe("areQuietCategoriesVisible", () => {
  const march = { year: 2026, month: 3 };

  it("hides categories with no spend yet through day 10 and shows them after it", () => {
    expect(areQuietCategoriesVisible(march, "2026-03-01")).toBe(false);
    expect(areQuietCategoriesVisible(march, "2026-03-10")).toBe(false);
    expect(areQuietCategoriesVisible(march, "2026-03-11")).toBe(true);
  });

  it("always shows them for a closed month", () => {
    expect(areQuietCategoriesVisible(march, "2026-04-01")).toBe(true);
  });

  it("never shows them for a month that has not started", () => {
    expect(areQuietCategoriesVisible(march, "2026-02-20")).toBe(false);
  });
});
