import { describe, it, expect } from "vitest";
import {
  buildInsightFacts,
  type InsightSources,
  type InsightTransactionRow,
  type RollupCategory,
} from "../index";

const categories: RollupCategory[] = [
  { id: "food", name: "מזון", color: "#111111", icon: "Apple", parentId: null },
  { id: "super", name: "סופר", color: "#222222", icon: "Cart", parentId: "food" },
  { id: "cafe", name: "בתי קפה", color: "#333333", icon: "Coffee", parentId: "food" },
  { id: "car", name: "רכב", color: "#444444", icon: "Car", parentId: null },
  { id: "salary", name: "משכורת", color: "#555555", icon: "Wallet", parentId: null },
  { id: "moves", name: "העברות", color: "#666666", icon: "Swap", parentId: null },
];

const typeOf: Record<string, InsightTransactionRow["categoryType"]> = {
  food: "expense",
  super: "expense",
  cafe: "expense",
  car: "expense",
  salary: "income",
  moves: "transfer",
};

let nextId = 1;
function row(
  date: string,
  chargedAmount: number,
  categoryId: string | null,
  extra: Partial<InsightTransactionRow> = {},
): InsightTransactionRow {
  return {
    id: `t${nextId++}`,
    date,
    description: "חנות לדוגמה",
    customDescription: null,
    chargedAmount,
    categoryId,
    categoryType: categoryId ? typeOf[categoryId] : null,
    reconciliationRole: null,
    ...extra,
  };
}

function sources(overrides: Partial<InsightSources> = {}): InsightSources {
  return {
    month: { year: 2026, month: 3 },
    today: "2026-03-15",
    rows: { month: [], previous: [], beforePrevious: [] },
    categories,
    balances: [],
    attention: { uncategorized: 0, needsReview: 0 },
    budgets: [],
    upcoming: [],
    expenseTarget: null,
    ...overrides,
  };
}

describe("buildInsightFacts", () => {
  it("reduces empty sources to empty facts", () => {
    expect(buildInsightFacts(sources())).toEqual({
      month: { year: 2026, month: 3 },
      today: "2026-03-15",
      cardDebits: [],
      attention: { uncategorized: 0, needsReview: 0 },
      budgets: [],
      upcomingRecurring: [],
      categoryChanges: [],
      biggestExpense: null,
      recap: null,
    });
  });

  it("takes card debits from card accounts' next-debit estimates only", () => {
    const facts = buildInsightFacts(
      sources({
        balances: [
          {
            id: "card1",
            accountNumber: "1",
            balance: -1250.5,
            bankType: "max",
            displayName: "כרטיס א",
            nextDebitDate: "2026-03-10",
          },
          {
            id: "card2",
            accountNumber: "2",
            balance: 0,
            bankType: "visaCal",
            displayName: "כרטיס ב",
            nextDebitDate: null,
          },
          {
            id: "bank1",
            accountNumber: "3",
            balance: -400,
            bankType: "discount",
            displayName: "עו״ש",
            nextDebitDate: null,
          },
        ],
      }),
    );
    expect(facts.cardDebits).toEqual([
      { accountId: "card1", displayName: "כרטיס א", amount: 1250.5, date: "2026-03-10" },
    ]);
  });

  describe("category changes", () => {
    it("compares top-level categories month-to-date against the same days last month", () => {
      const facts = buildInsightFacts(
        sources({
          rows: {
            month: [
              row("2026-03-02", -300, "super"),
              row("2026-03-10", -100, "cafe"),
              row("2026-03-20", -200, "car"),
              row("2026-03-01", 9000, "salary"),
            ],
            previous: [
              row("2026-02-05", -150, "super"),
              row("2026-02-14", -400, "car"),
              row("2026-02-20", -500, "car"),
            ],
            beforePrevious: [],
          },
        }),
      );
      expect(facts.categoryChanges).toEqual([
        {
          categoryId: "food",
          name: "מזון",
          color: "#111111",
          icon: "Apple",
          amount: 400,
          previous: 150,
        },
        { categoryId: "car", name: "רכב", color: "#444444", icon: "Car", amount: 0, previous: 400 },
      ]);
    });

    it("compares whole months once the month is closed", () => {
      const facts = buildInsightFacts(
        sources({
          today: "2026-04-02",
          rows: {
            month: [row("2026-03-20", -200, "car")],
            previous: [row("2026-02-14", -400, "car"), row("2026-02-27", -500, "car")],
            beforePrevious: [],
          },
        }),
      );
      expect(facts.categoryChanges).toEqual([
        {
          categoryId: "car",
          name: "רכב",
          color: "#444444",
          icon: "Car",
          amount: 200,
          previous: 900,
        },
      ]);
    });

    it("sums floored leaves, so one leaf's refund never offsets a sibling", () => {
      const facts = buildInsightFacts(
        sources({
          rows: {
            month: [row("2026-03-02", -300, "super"), row("2026-03-03", 50, "cafe")],
            previous: [],
            beforePrevious: [],
          },
        }),
      );
      expect(facts.categoryChanges.map((c) => [c.categoryId, c.amount])).toEqual([["food", 300]]);
    });

    it("never lets a row reconciliation flagged as the settlement lump inflate category spend", () => {
      const facts = buildInsightFacts(
        sources({
          rows: {
            month: [
              row("2026-03-02", -3000, "car", {
                description: "חיוב לכרטיס ויזה",
                reconciliationRole: "settlement_lump",
              }),
              row("2026-03-03", -120, "car", { description: "מוסך לדוגמה" }),
            ],
            previous: [],
            beforePrevious: [],
          },
        }),
      );
      expect(facts.categoryChanges.map((c) => [c.categoryId, c.amount])).toEqual([["car", 120]]);
    });

    it("counts ordinary expenses whose description merely looks like a settlement", () => {
      const facts = buildInsightFacts(
        sources({
          rows: {
            month: [
              row("2026-03-02", -45, "car", { description: "דמי ניהול חשבון 2026" }),
              row("2026-03-03", -180, "car", { description: "חיוב ישיר ביטוח לדוגמה" }),
            ],
            previous: [],
            beforePrevious: [],
          },
        }),
      );
      expect(facts.categoryChanges.map((c) => [c.categoryId, c.amount])).toEqual([["car", 225]]);
      expect(facts.biggestExpense?.amount).toBe(180);
    });
  });

  describe("biggest expense", () => {
    it("is the month's largest expense charge so far, shown by its custom description", () => {
      const big = row("2026-03-09", -800, "super", {
        description: "סופר לדוגמה סניף",
        customDescription: "קנייה גדולה",
      });
      const facts = buildInsightFacts(
        sources({
          rows: {
            month: [
              row("2026-03-02", -300, "cafe"),
              big,
              row("2026-03-01", 9000, "salary"),
              row("2026-03-04", -5000, "moves"),
              row("2026-03-05", -2000, null),
              row("2026-03-25", -4000, "car"),
              row("2026-03-06", -9000, "car", { reconciliationRole: "settlement_lump" }),
            ],
            previous: [],
            beforePrevious: [],
          },
        }),
      );
      expect(facts.biggestExpense).toEqual({
        transactionId: big.id,
        description: "קנייה גדולה",
        amount: 800,
        date: "2026-03-09",
        categoryId: "super",
        categoryName: "סופר",
      });
    });

    it("is absent when the month has no expense charge", () => {
      const facts = buildInsightFacts(
        sources({
          rows: { month: [row("2026-03-03", 40, "cafe")], previous: [], beforePrevious: [] },
        }),
      );
      expect(facts.biggestExpense).toBeNull();
    });
  });

  describe("month recap", () => {
    const bigShop = row("2026-02-03", -1200, "super", { description: "סופר לדוגמה" });
    const february = [
      row("2026-02-01", 10000, "salary"),
      bigShop,
      row("2026-02-12", -300, "super"),
      row("2026-02-12", -200, "cafe"),
      row("2026-02-20", -500, "car"),
      row("2026-02-12", -3000, "car", { reconciliationRole: "settlement_lump" }),
      row("2026-02-10", -4000, "moves"),
    ];
    const january = [row("2026-01-04", -1000, "super"), row("2026-01-09", -900, "car")];
    const upcoming: InsightSources["upcoming"] = [
      {
        id: "r1",
        name: "מנוי א",
        amount: 40,
        date: "2026-03-20",
        lastChargeDate: "2026-02-18",
        cadence: "monthly",
      },
      {
        id: "r2",
        name: "מנוי ב",
        amount: 60,
        date: "2026-03-22",
        lastChargeDate: "2026-02-20",
        cadence: "monthly",
      },
      {
        id: "r3",
        name: "ביטוח שנתי",
        amount: 500,
        date: "2026-03-25",
        lastChargeDate: "2025-03-25",
        cadence: "annual",
      },
    ];

    it("recaps last month while the month is current, keeping the lump out of category figures", () => {
      const { recap } = buildInsightFacts(
        sources({
          rows: {
            month: [row("2026-03-02", -50, "cafe")],
            previous: february,
            beforePrevious: january,
          },
          upcoming,
          expenseTarget: 2000,
        }),
      );
      expect(recap).toMatchObject({
        month: { year: 2026, month: 2 },
        topCategory: { categoryId: "food", name: "מזון", color: "#111111", amount: 1700 },
        biggestChange: { categoryId: "food", name: "מזון", amount: 1700, previous: 1000 },
        mostExpensiveDay: { date: "2026-02-03", amount: 1200, topDescription: "סופר לדוגמה" },
        recurring: { count: 2, monthlyTotal: 100 },
      });
      expect(recap?.topCategory?.share).toBeCloseTo(0.773, 3);
    });

    it("keeps the recap's month totals equal to the Dashboard's, lump category and all", () => {
      const { recap } = buildInsightFacts(
        sources({
          rows: { month: [], previous: february, beforePrevious: january },
          expenseTarget: 5000,
        }),
      );
      expect(recap).toMatchObject({
        income: 10000,
        expenses: 5200,
        netSavings: 4800,
        savingsRate: 48,
        verdict: { target: 5000, over: true, by: 200 },
      });
    });

    it("recaps the month itself once it is closed", () => {
      const { recap } = buildInsightFacts(
        sources({
          month: { year: 2026, month: 2 },
          today: "2026-04-02",
          rows: { month: february, previous: january, beforePrevious: [] },
          expenseTarget: 6000,
        }),
      );
      expect(recap).toMatchObject({
        month: { year: 2026, month: 2 },
        expenses: 5200,
        verdict: { target: 6000, over: false, by: 800 },
      });
    });

    it("has no savings rate without income and no verdict without a target", () => {
      const { recap } = buildInsightFacts(
        sources({
          today: "2026-04-02",
          rows: { month: [row("2026-03-05", -100, "car")], previous: [], beforePrevious: [] },
        }),
      );
      expect(recap).toMatchObject({
        income: 0,
        savingsRate: null,
        biggestChange: null,
        verdict: null,
      });
    });

    it("is absent when the recapped month has no income or expense", () => {
      const facts = buildInsightFacts(
        sources({
          rows: {
            month: [row("2026-03-02", -50, "cafe")],
            previous: [row("2026-02-10", -4000, "moves")],
            beforePrevious: [],
          },
        }),
      );
      expect(facts.recap).toBeNull();
    });

    it("is absent, like every month figure, for a month that has not started", () => {
      const facts = buildInsightFacts(
        sources({
          month: { year: 2026, month: 4 },
          rows: { month: [], previous: february, beforePrevious: january },
        }),
      );
      expect(facts).toMatchObject({ categoryChanges: [], biggestExpense: null, recap: null });
    });
  });

  it("names each budget after its category", () => {
    const facts = buildInsightFacts(
      sources({
        budgets: [
          { budgetId: "b1", categoryId: "car", verdict: "at-risk", spent: 450, limit: 500 },
        ],
      }),
    );
    expect(facts.budgets).toEqual([
      {
        budgetId: "b1",
        categoryId: "car",
        categoryName: "רכב",
        verdict: "at-risk",
        spent: 450,
        limit: 500,
      },
    ]);
  });

  it("passes the upcoming recurring charges through, rounded to agorot", () => {
    const charge = {
      id: "r1",
      name: "מנוי לדוגמה",
      date: "2026-03-20",
      lastChargeDate: "2026-02-18",
      cadence: "monthly" as const,
    };
    const facts = buildInsightFacts(sources({ upcoming: [{ ...charge, amount: 100 / 3 }] }));
    expect(facts.upcomingRecurring).toEqual([{ ...charge, amount: 33.33 }]);
  });
});
