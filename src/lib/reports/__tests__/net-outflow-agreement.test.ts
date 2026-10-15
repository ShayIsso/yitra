import { describe, it, expect } from "vitest";
import {
  computeMonthlySummary,
  computeSpendingByCategory,
  computeTopMerchants,
  rollUpSpendingByGroup,
  type RollupCategory,
  type TransactionWithCategory,
} from "@/lib/analytics";
import { computeCategorySpend, computeSubtreeSpend } from "@/lib/budgets";
import { buildMonthlyReport } from "../monthly";
import { buildTrendsReport } from "../trends";
import { buildMonthCloseVerdicts, type BudgetConfig } from "../month-close";

// One synthetic month exercising every #304 shape: a reversed-and-re-presented
// rent check, a refund-only category, a partly refunded category, and an
// investment withdrawal larger than the month's deposit.
const CATEGORIES: RollupCategory[] = [
  { id: "home", name: "בית", color: "#222", icon: "Home", parentId: null },
  { id: "rent", name: "שכירות", color: "#222", icon: "Home", parentId: "home" },
  { id: "utilities", name: "חשבונות", color: "#222", icon: "Zap", parentId: "home" },
  { id: "food", name: "אוכל", color: "#333", icon: "Utensils", parentId: null },
  { id: "clothing", name: "ביגוד", color: "#444", icon: "Shirt", parentId: null },
];

type Row = TransactionWithCategory & { description: string };

const CLOTHING_REFUND = 200;

const row = (
  categoryId: string,
  categoryType: Row["categoryType"],
  chargedAmount: number,
  description: string,
): Row => ({
  chargedAmount,
  categoryType,
  categoryId,
  categoryName: categoryId,
  categoryColor: "#888888",
  categoryIcon: "MoreHorizontal",
  description,
});

const MONTH: Row[] = [
  row("salary", "income", 10000, "משכורת לדוגמה"),
  ...[-1000, 1000, -1000, -1000, 1000].map((a) => row("rent", "expense", a, "שכירות לדוגמה")),
  row("utilities", "expense", -300, "חברת חשמל לדוגמה"),
  row("clothing", "expense", CLOTHING_REFUND, "חנות בגדים לדוגמה"),
  row("food", "expense", -800, "סופר לדוגמה"),
  row("food", "expense", 100, "סופר לדוגמה"),
  row("fund", "investment", -500, "קרן לדוגמה"),
  row("fund", "investment", 2000, "קרן לדוגמה"),
  row("own", "transfer", -5000, "העברה לדוגמה"),
  row("noise", "ignore", -50, "רעש לדוגמה"),
];

const YM = { year: 2026, month: 3 };
const CLOSED_TODAY = "2026-04-02";

const budget = (categoryId: string, monthlyLimit: number): BudgetConfig => ({
  id: `b-${categoryId}`,
  categoryId,
  categoryName: categoryId,
  categoryColor: "#888888",
  monthlyLimit,
});
const BUDGETS = [budget("home", 2000), budget("food", 1000), budget("clothing", 500)];

const EXPECTED = {
  expenses: 1800, // 1000 rent + 300 utilities + 700 food − 200 clothing refund
  netSavings: 8200,
  investment: -1500,
  home: 1300,
  food: 700,
};

describe("one month agrees across dashboard, budgets, month-close and reports (#304)", () => {
  it("dashboard: net month totals, floored breakdown, net top merchants", () => {
    const summary = computeMonthlySummary(MONTH);
    expect(summary.expenses).toBe(EXPECTED.expenses);
    expect(summary.netSavings).toBe(EXPECTED.netSavings);
    expect(summary.investmentTotal).toBe(EXPECTED.investment);

    const nodes = rollUpSpendingByGroup(computeSpendingByCategory(MONTH), CATEGORIES);
    expect(nodes.map((n) => [n.categoryId, n.amount])).toEqual([
      ["home", EXPECTED.home],
      ["food", EXPECTED.food],
    ]);
    const breakdownTotal = nodes.reduce((sum, n) => sum + n.amount, 0);
    expect(breakdownTotal - summary.expenses).toBe(CLOTHING_REFUND);

    expect(computeTopMerchants(MONTH).map((m) => m.amount)).toEqual([1000, 700, 300]);
  });

  it("budgets: gauges read the same floored category spend", () => {
    const spend = computeCategorySpend(MONTH);
    expect(computeSubtreeSpend("home", CATEGORIES, spend)).toBe(EXPECTED.home);
    expect(computeSubtreeSpend("food", CATEGORIES, spend)).toBe(EXPECTED.food);
    expect(computeSubtreeSpend("clothing", CATEGORIES, spend)).toBe(0);
  });

  it("month-close: verdict spend and net savings match the dashboard", () => {
    const verdicts = buildMonthCloseVerdicts(YM, CLOSED_TODAY, MONTH, CATEGORIES, BUDGETS, 8000);
    expect(verdicts.budgets.map((b) => [b.id, b.spent])).toEqual([
      ["b-home", EXPECTED.home],
      ["b-food", EXPECTED.food],
      ["b-clothing", 0],
    ]);
    expect(verdicts.savingsTarget?.netSavings).toBe(EXPECTED.netSavings);
  });

  it("monthly report and its YoY column carry the same net figures", () => {
    const report = buildMonthlyReport({ transactions: MONTH }, { transactions: MONTH }, CATEGORIES);
    expect(report.summary.expenses).toEqual({
      current: EXPECTED.expenses,
      lastYear: EXPECTED.expenses,
    });
    expect(report.summary.investment).toEqual({
      current: EXPECTED.investment,
      lastYear: EXPECTED.investment,
    });
    expect(report.breakdown.map((n) => [n.categoryId, n.amount, n.lastYearAmount])).toEqual([
      ["home", EXPECTED.home, EXPECTED.home],
      ["food", EXPECTED.food, EXPECTED.food],
    ]);
  });

  it("trends report: the month's point, breakdown series and year row match", () => {
    const trends = buildTrendsReport([{ ...YM, transactions: MONTH }], CATEGORIES);
    expect(trends.months[0]).toMatchObject({
      expenses: EXPECTED.expenses,
      netSavings: EXPECTED.netSavings,
      investment: EXPECTED.investment,
    });
    expect(trends.breakdown.map((s) => [s.categoryId, s.amounts])).toEqual([
      ["home", [EXPECTED.home]],
      ["food", [EXPECTED.food]],
    ]);
    expect(trends.years[0]).toMatchObject({
      expenses: EXPECTED.expenses,
      investment: EXPECTED.investment,
    });
  });
});
