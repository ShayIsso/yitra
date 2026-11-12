import { describe, it, expect } from "vitest";
import {
  categoryChangeView,
  changeView,
  chartColumns,
  comparisonLabel,
  rateChangeView,
  sparklinePath,
} from "@/components/home/trends/trends-view";

const LRM = "‎";

describe("changeView", () => {
  it("tells a rise as a signed percent, judged by which way is good", () => {
    expect(changeView({ amount: 600, percent: 10 }, "up")).toEqual({
      direction: "up",
      verdict: "good",
      label: `${LRM}+10%`,
    });
    expect(changeView({ amount: 600, percent: 10 }, "down")).toMatchObject({ verdict: "bad" });
  });

  it("falls back to signed shekels when there is no percent", () => {
    const view = changeView({ amount: -880, percent: null }, "down");
    expect(view.direction).toBe("down");
    expect(view.verdict).toBe("good");
    expect(view.label).toContain("-880");
    expect(view.label).toContain("₪");
  });

  it("judges nothing for a metric with no good direction", () => {
    expect(changeView({ amount: 300, percent: 5 }, "neutral").verdict).toBeNull();
  });

  it("calls an unchanged figure flat", () => {
    expect(changeView({ amount: 0, percent: null }, "up")).toEqual({
      direction: "flat",
      verdict: null,
      label: "ללא שינוי",
    });
  });
});

describe("rateChangeView", () => {
  it("states the savings rate's move in percentage points", () => {
    expect(rateChangeView(-8.2)).toEqual({
      direction: "down",
      verdict: "bad",
      label: `${LRM}-8 נק׳`,
    });
  });

  it("calls a move under half a point flat", () => {
    expect(rateChangeView(0.3).direction).toBe("flat");
  });
});

describe("categoryChangeView", () => {
  it("names a category with no spend in the comparison window new, not +∞", () => {
    expect(categoryChangeView({ previous: 0, amount: 450, percent: null })).toEqual({
      direction: "new",
      verdict: null,
      label: "חדש",
    });
  });

  it("judges a category's rise as bad", () => {
    expect(categoryChangeView({ previous: 300, amount: 300, percent: 100 })).toMatchObject({
      direction: "up",
      verdict: "bad",
    });
  });
});

describe("comparisonLabel", () => {
  it("names the same days of last month for a running month", () => {
    expect(
      comparisonLabel({ basis: "month-to-date", previousMonth: { year: 2026, month: 2 } }),
    ).toBe("מול אותם ימים בפברואר");
  });

  it("names the whole month before for a closed month", () => {
    expect(
      comparisonLabel({ basis: "whole-month", previousMonth: { year: 2025, month: 12 } }),
    ).toBe("מול דצמבר");
  });
});

describe("sparklinePath", () => {
  it("draws the oldest value at the right edge and the newest at the left", () => {
    expect(sparklinePath([0, 10], 100, 20)).toBe("M100,20L0,0");
  });

  it("breaks the line where a value is missing", () => {
    expect(sparklinePath([0, null, 10, 10], 30, 10)).toBe("M30,10M10,0L0,0");
  });

  it("draws a flat series along the middle", () => {
    expect(sparklinePath([5, 5], 10, 10)).toBe("M10,5L0,5");
  });
});

describe("chartColumns", () => {
  const month = (m: number, income: number, expenses: number) => ({
    year: 2026,
    month: m,
    income,
    expenses,
  });

  it("scales income and expenses against the window's largest figure", () => {
    expect(chartColumns([month(1, 10000, 5000), month(2, 8000, 12500)])).toEqual([
      { income: 0.8, expenses: 0.4 },
      { income: 0.64, expenses: 1 },
    ]);
  });

  it("draws no bar for a negative figure (a net-refund month)", () => {
    expect(chartColumns([month(1, 1000, -200)])).toEqual([{ income: 1, expenses: 0 }]);
  });

  it("draws nothing in an empty window", () => {
    expect(chartColumns([month(1, 0, 0)])).toEqual([{ income: 0, expenses: 0 }]);
  });
});
