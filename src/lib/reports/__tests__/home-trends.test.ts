import { describe, it, expect } from "vitest";
import {
  buildHomeTrends,
  homeTrendWindowEnd,
  type HomeTrendsInput,
  type HomeTrendRow,
} from "../home-trends";
import { buildTrendsReport, enumerateMonthRange } from "../trends";
import type { RollupCategory } from "@/lib/analytics";

// Invented taxonomy: one expense group with two leaves, an expense root leaf,
// an income leaf and an investment leaf.
const categories: RollupCategory[] = [
  { id: "food", name: "אוכל", color: "#f59e0b", icon: "Utensils", parentId: null },
  { id: "grocery", name: "סופר", color: "#fbbf24", icon: "ShoppingCart", parentId: "food" },
  { id: "dining", name: "מסעדות", color: "#f97316", icon: "Coffee", parentId: "food" },
  { id: "transport", name: "תחבורה", color: "#14b8a6", icon: "Bus", parentId: null },
  { id: "salary", name: "משכורת", color: "#10b981", icon: "Wallet", parentId: null },
  { id: "fund", name: "קרן", color: "#3b82f6", icon: "TrendingUp", parentId: null },
];

const TYPE_OF: Record<string, HomeTrendRow["categoryType"]> = {
  grocery: "expense",
  dining: "expense",
  transport: "expense",
  salary: "income",
  fund: "investment",
};

/** A row on `date`; `amount` is the signed charged amount (spend is negative). */
function row(date: string, categoryId: string, amount: number): HomeTrendRow {
  const c = categories.find((x) => x.id === categoryId)!;
  return {
    date,
    chargedAmount: amount,
    categoryType: TYPE_OF[categoryId],
    categoryId,
    categoryName: c.name,
    categoryColor: c.color,
    categoryIcon: c.icon,
    reconciliationRole: null,
  };
}

type Month = { year: number; month: number };

/** The input for `selected` as of `today`, from the rows of every month that has any. */
function input(selected: Month, today: string, rows: HomeTrendRow[]): HomeTrendsInput {
  const end = homeTrendWindowEnd(selected, {
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  });
  const window = enumerateMonthRange(`${end.year}-${String(end.month).padStart(2, "0")}-01`, 12);
  const inMonth = (m: Month) => (r: HomeTrendRow) =>
    Number(r.date.slice(0, 4)) === m.year && Number(r.date.slice(5, 7)) === m.month;
  const previous =
    selected.month === 1
      ? { year: selected.year - 1, month: 12 }
      : { year: selected.year, month: selected.month - 1 };
  return {
    month: selected,
    today,
    trend: buildTrendsReport(
      window.map((m) => ({ ...m, transactions: rows.filter(inMonth(m)) })),
      categories,
    ),
    rows: { month: rows.filter(inMonth(selected)), previous: rows.filter(inMonth(previous)) },
    categories,
  };
}

const MARCH = { year: 2026, month: 3 };
const FEBRUARY = { year: 2026, month: 2 };

describe("homeTrendWindowEnd", () => {
  it("ends at the current month while the selected month is inside the last twelve", () => {
    expect(homeTrendWindowEnd({ year: 2025, month: 4 }, MARCH)).toEqual(MARCH);
    expect(homeTrendWindowEnd(MARCH, MARCH)).toEqual(MARCH);
  });

  it("ends at the selected month once it is older than that", () => {
    expect(homeTrendWindowEnd({ year: 2025, month: 3 }, MARCH)).toEqual({ year: 2025, month: 3 });
  });
});

describe("buildHomeTrends — month totals", () => {
  it("reports the selected month's net totals, a refund lowering expenses", () => {
    const trends = buildHomeTrends(
      input(FEBRUARY, "2026-03-15", [
        row("2026-02-01", "salary", 10000),
        row("2026-02-03", "grocery", -3000),
        row("2026-02-09", "grocery", 400),
        row("2026-02-10", "fund", -1000),
      ]),
    );
    expect(trends.totals).toEqual({
      income: 10000,
      expenses: 2600,
      netSavings: 7400,
      investment: 1000,
      savingsRate: 74,
    });
  });

  it("has no savings rate in a month with no income, never a 0%", () => {
    const trends = buildHomeTrends(
      input(FEBRUARY, "2026-03-15", [row("2026-02-03", "grocery", -3000)]),
    );
    expect(trends.totals.savingsRate).toBeNull();
    expect(trends.totals.netSavings).toBe(-3000);
  });

  it("carries twelve months oldest first, with the selected month marked", () => {
    const trends = buildHomeTrends(
      input(FEBRUARY, "2026-03-15", [
        row("2026-02-01", "salary", 8000),
        row("2026-02-03", "grocery", -2000),
      ]),
    );
    expect(trends.months).toHaveLength(12);
    expect(trends.months[0]).toMatchObject({ year: 2025, month: 4, hasData: false });
    expect(trends.months[11]).toMatchObject({ year: 2026, month: 3 });
    expect(trends.selectedIndex).toBe(10);
    expect(trends.months[10]).toMatchObject({ income: 8000, expenses: 2000, savingsRate: 75 });
    expect(trends.months[11].savingsRate).toBeNull();
  });
});

describe("buildHomeTrends — rows dated ahead of today", () => {
  const rows = [
    row("2026-03-01", "salary", 10000),
    row("2026-03-04", "transport", -400),
    // An installment the bank already lists for later this month.
    row("2026-03-25", "transport", -900),
  ];

  it("leaves them out of a running month's figures: not spent yet", () => {
    const trends = buildHomeTrends(input(MARCH, "2026-03-15", rows));
    expect(trends.totals.expenses).toBe(400);
    expect(trends.months[trends.selectedIndex].expenses).toBe(400);
    const transport = trends.categories.rows[0];
    expect(transport.amount).toBe(400);
    expect(transport.series[trends.selectedIndex]).toBe(400);
  });

  it("counts them once the month has closed", () => {
    const trends = buildHomeTrends(input(MARCH, "2026-04-02", rows));
    expect(trends.totals.expenses).toBe(1300);
    expect(trends.categories.rows[0].amount).toBe(1300);
  });
});

describe("buildHomeTrends — month-over-month comparison", () => {
  const rows = [
    row("2026-02-01", "salary", 10000),
    row("2026-02-05", "grocery", -1000),
    row("2026-02-20", "grocery", -3000),
    row("2026-03-01", "salary", 11000),
    row("2026-03-04", "grocery", -1500),
    row("2026-03-12", "transport", -500),
    // Dated ahead of today: listed by the bank, not spent yet.
    row("2026-03-25", "transport", -900),
  ];

  it("compares the current month with last month through the same day", () => {
    const { comparison } = buildHomeTrends(input(MARCH, "2026-03-15", rows));
    expect(comparison).toMatchObject({
      state: "shown",
      basis: "month-to-date",
      previousMonth: FEBRUARY,
      income: { amount: 1000, percent: 10 },
      expenses: { amount: 1000, percent: 100 },
      netSavings: { amount: 0, percent: null },
    });
  });

  it("states the savings rate's change in percentage points", () => {
    const { comparison } = buildHomeTrends(input(MARCH, "2026-03-15", rows));
    // 9,000 of 10,000 saved last month to date, 9,000 of 11,000 this month.
    expect(comparison.state === "shown" && comparison.savingsRate).toBeCloseTo(-8.18, 2);
  });

  it("hides the comparison before the day the insight rules allow it", () => {
    const { comparison } = buildHomeTrends(input(MARCH, "2026-03-06", rows));
    expect(comparison).toEqual({ state: "early", visibleFromDay: 7 });
  });

  it("shows it from that day on", () => {
    const { comparison } = buildHomeTrends(input(MARCH, "2026-03-07", rows));
    expect(comparison.state).toBe("shown");
  });

  it("compares a closed month with the whole month before it", () => {
    const closed = [
      ...rows,
      row("2026-01-10", "grocery", -2000),
      row("2026-01-02", "salary", 9000),
    ];
    const { comparison } = buildHomeTrends(input(FEBRUARY, "2026-03-15", closed));
    expect(comparison).toMatchObject({
      state: "shown",
      basis: "whole-month",
      previousMonth: { year: 2026, month: 1 },
      expenses: { amount: 2000, percent: 100 },
    });
  });

  it("has nothing to compare with when the month before holds no rows", () => {
    const { comparison } = buildHomeTrends(input(FEBRUARY, "2026-03-15", rows));
    expect(comparison).toEqual({ state: "no-history" });
  });

  it("has no rate change when either month's rate is not a figure", () => {
    const noIncome = rows.filter(
      (r) => !(r.categoryId === "salary" && r.date.startsWith("2026-02")),
    );
    const { comparison } = buildHomeTrends(input(MARCH, "2026-03-15", noIncome));
    expect(comparison.state === "shown" && comparison.savingsRate).toBeNull();
  });
});

describe("buildHomeTrends — categories", () => {
  const rows = [
    row("2026-02-03", "grocery", -800),
    row("2026-02-18", "grocery", -400),
    row("2026-02-06", "transport", -300),
    row("2026-02-08", "dining", -250),
    row("2026-03-02", "grocery", -1200),
    row("2026-03-05", "dining", -300),
    // A refund larger than the month's spend: dining nets to a refund.
    row("2026-03-09", "dining", 500),
    row("2026-03-10", "transport", -600),
    row("2026-03-01", "salary", 9000),
  ];

  it("ranks top-level categories under the spend floor, groups summing floored leaves", () => {
    const { categories: list } = buildHomeTrends(input(MARCH, "2026-03-15", rows));
    expect(list.rows.map((r) => [r.categoryId, r.amount])).toEqual([
      ["food", 1200],
      ["transport", 600],
    ]);
    expect(list.rows[0].children.map((c) => [c.categoryId, c.amount])).toEqual([["grocery", 1200]]);
    expect(list.total).toBe(1800);
    expect(list.rows[1].share).toBeCloseTo(1 / 3, 5);
  });

  it("carries each category's twelve-month series, aligned to the months", () => {
    const { categories: list, months } = buildHomeTrends(input(MARCH, "2026-03-15", rows));
    const food = list.rows[0];
    expect(food.series).toHaveLength(months.length);
    expect(food.series.slice(-2)).toEqual([1450, 1200]);
    expect(food.children[0].series.slice(-2)).toEqual([1200, 1200]);
  });

  it("leaves a month with no rows at all out of a category's series, rather than calling it ₪0", () => {
    const { categories: list, months } = buildHomeTrends(input(MARCH, "2026-03-15", rows));
    expect(months[0].hasData).toBe(false);
    expect(list.rows[0].series[0]).toBeNull();
    // A month with rows but none in this category did spend ₪0 on it.
    const salaryOnly = [...rows, row("2026-01-05", "salary", 9000)];
    const january = buildHomeTrends(input(MARCH, "2026-03-15", salaryOnly)).categories.rows[0];
    expect(january.series.at(-3)).toBe(0);
  });

  it("compares each category through the same day of last month", () => {
    const { categories: list } = buildHomeTrends(input(MARCH, "2026-03-15", rows));
    // Last month through the 15th: groceries 800 and dining 250.
    expect(list.rows[0].change).toEqual({
      previous: 1050,
      amount: 150,
      percent: expect.any(Number),
    });
    expect(list.rows[0].children[0].change).toMatchObject({ previous: 800, amount: 400 });
    expect(list.rows[1].change).toMatchObject({ previous: 300, amount: 300, percent: 100 });
  });

  it("has no category change while the month-over-month comparison is hidden", () => {
    const { categories: list } = buildHomeTrends(input(MARCH, "2026-03-05", rows));
    expect(list.rows.every((r) => r.change === null)).toBe(true);
  });

  it("leaves a flagged settlement lump out of every category figure", () => {
    const lump = {
      ...row("2026-03-11", "transport", -5000),
      reconciliationRole: "settlement_lump",
    };
    const { categories: list, totals } = buildHomeTrends(
      input(MARCH, "2026-03-15", [...rows, lump as HomeTrendRow]),
    );
    expect(list.rows.find((r) => r.categoryId === "transport")?.amount).toBe(600);
    // Month totals stay type-driven.
    expect(totals.expenses).toBe(6600);
  });
});

describe("buildHomeTrends — quiet categories", () => {
  const rows = [
    row("2026-02-04", "grocery", -900),
    row("2026-02-21", "transport", -350),
    row("2026-03-02", "grocery", -700),
  ];

  it("lists nothing quiet through day 10 of a running month", () => {
    expect(buildHomeTrends(input(MARCH, "2026-03-10", rows)).quiet).toEqual([]);
  });

  it("lists top-level categories that spent last month but nothing yet, from day 11", () => {
    expect(buildHomeTrends(input(MARCH, "2026-03-11", rows)).quiet).toEqual([
      { categoryId: "transport", name: "תחבורה", color: "#14b8a6", icon: "Bus", previous: 350 },
    ]);
  });

  it("lists them for a closed month too", () => {
    const closed = [...rows, row("2026-01-09", "transport", -120)];
    const { quiet } = buildHomeTrends(input(FEBRUARY, "2026-03-11", closed));
    expect(quiet).toEqual([]);
    const { quiet: marchQuiet } = buildHomeTrends(
      input({ year: 2026, month: 3 }, "2026-04-02", rows),
    );
    expect(marchQuiet.map((q) => q.categoryId)).toEqual(["transport"]);
  });
});
