import { describe, it, expect } from "vitest";
import {
  computeMonthlySummary,
  computeSpendingByCategory,
  outflowContribution,
  type TransactionWithCategory,
} from "../index";

const row = (
  categoryId: string,
  categoryType: TransactionWithCategory["categoryType"],
  chargedAmount: number,
): TransactionWithCategory => ({
  chargedAmount,
  categoryType,
  categoryId,
  categoryName: categoryId,
  categoryColor: "#888888",
  categoryIcon: "MoreHorizontal",
});

// Synthetic: a check, its return, two re-presentations, and one reversed duplicate.
const RENT_MONTH = [-1000, 1000, -1000, -1000, 1000].map((amount) =>
  row("rent", "expense", amount),
);

describe("outflowContribution", () => {
  it("counts an outflow as positive spend and an inflow as negative spend", () => {
    expect(outflowContribution(-250)).toBe(250);
    expect(outflowContribution(80)).toBe(-80);
  });
});

describe("net outflow rule — expense (#304)", () => {
  it("nets a returned and reversed rent check to one rent payment in the category", () => {
    const spending = computeSpendingByCategory(RENT_MONTH);
    expect(spending).toEqual([expect.objectContaining({ categoryId: "rent", amount: 1000 })]);
  });

  it("adds the net 1000, not the 5000 gross, to the month's expenses", () => {
    expect(computeMonthlySummary(RENT_MONTH).expenses).toBe(1000);
  });

  it("floors a refund-only category out of the breakdown while the refund still lowers month expenses", () => {
    const month = [row("food", "expense", -600), row("clothing", "expense", 150)];

    expect(computeSpendingByCategory(month).map((s) => s.categoryId)).toEqual(["food"]);
    expect(computeMonthlySummary(month).expenses).toBe(450);
  });

  it("drops a category whose purchases and refunds cancel to float residue", () => {
    const month = [
      row("gifts", "expense", -10.1),
      row("gifts", "expense", -20.2),
      row("gifts", "expense", 30.3),
    ];
    expect(computeSpendingByCategory(month)).toEqual([]);
  });

  it("rounds month expenses to agorot, so purchases and refunds that cancel total exactly 0", () => {
    const month = [
      row("gifts", "expense", -10.1),
      row("gifts", "expense", -20.2),
      row("gifts", "expense", 30.3),
    ];
    expect(computeMonthlySummary(month).expenses).toBe(0);
  });

  it("raises net savings by a refund in an expense category", () => {
    const month = [
      row("salary", "income", 8000),
      row("food", "expense", -2000),
      row("food", "expense", 300),
    ];
    expect(computeMonthlySummary(month).netSavings).toBe(6300);
  });
});

describe("net outflow rule — investment (#304)", () => {
  it("is net deployment: deposits minus withdrawals", () => {
    const month = [row("fund", "investment", -1500), row("fund", "investment", 500)];
    expect(computeMonthlySummary(month).investmentTotal).toBe(1000);
  });

  it("rounds net deployment to agorot, so a withdrawal cancelling the deposits is exactly 0, not −0", () => {
    const month = [
      row("fund", "investment", 0.1),
      row("fund", "investment", 0.2),
      row("fund", "investment", -0.3),
    ];
    expect(computeMonthlySummary(month).investmentTotal).toBe(0);
  });

  it("goes negative in a month whose withdrawals exceed its deposits, leaving net savings untouched", () => {
    const month = [
      row("salary", "income", 8000),
      row("food", "expense", -3000),
      row("fund", "investment", -1000),
      row("fund", "investment", 4000),
    ];
    const summary = computeMonthlySummary(month);
    expect(summary.investmentTotal).toBe(-3000);
    expect(summary.netSavings).toBe(5000);
  });
});
