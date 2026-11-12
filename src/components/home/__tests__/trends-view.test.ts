import { describe, it, expect } from "vitest";
import {
  categoryChangeView,
  changeView,
  chartColumns,
  comparisonCaption,
  comparisonLabel,
  rateChangeView,
  sparklinePath,
} from "@/components/home/trends/trends-view";

const LRM = "‎";

describe("changeView", () => {
  it("tells a rise as a signed percent", () => {
    expect(changeView({ amount: 600, percent: 10 })).toEqual({
      direction: "up",
      label: `${LRM}+10%`,
    });
  });

  it("falls back to signed shekels when there is no percent", () => {
    const view = changeView({ amount: -880, percent: null });
    expect(view.direction).toBe("down");
    expect(view.label).toContain("-880");
    expect(view.label).toContain("₪");
  });

  it("calls an unchanged figure flat", () => {
    expect(changeView({ amount: 0, percent: null })).toEqual({
      direction: "flat",
      label: "ללא שינוי",
    });
  });
});

describe("rateChangeView", () => {
  it("states the savings rate's move in percentage points", () => {
    expect(rateChangeView(-8.2)).toEqual({ direction: "down", label: `${LRM}-8 נק׳` });
  });

  it("calls a move under half a point flat", () => {
    expect(rateChangeView(0.3).direction).toBe("flat");
  });
});

describe("categoryChangeView", () => {
  it("names a category with no spend all last month new, not +∞", () => {
    expect(
      categoryChangeView({ previous: 0, previousWhole: 0, amount: 450, percent: null }),
    ).toEqual({ direction: "flat", label: "חדש" });
  });

  it("never calls a category new that spent last month, even after this date", () => {
    // A monthly charge on the 20th last month, the 3rd this month.
    const view = categoryChangeView({
      previous: 0,
      previousWhole: 250,
      amount: 250,
      percent: null,
    });
    expect(view.label).not.toBe("חדש");
    expect(view.direction).toBe("up");
  });

  it("tells a category's rise like any change", () => {
    expect(
      categoryChangeView({ previous: 300, previousWhole: 300, amount: 300, percent: 100 }),
    ).toMatchObject({ direction: "up" });
  });
});

describe("comparisonCaption", () => {
  it("names the comparison", () => {
    expect(
      comparisonCaption({
        state: "shown",
        basis: "whole-month",
        previousMonth: { year: 2025, month: 12 },
        income: { amount: 0, percent: null },
        expenses: { amount: 0, percent: null },
        netSavings: { amount: 0, percent: null },
        investment: { amount: 0, percent: null },
        savingsRate: null,
      }),
    ).toBe("מול דצמבר");
  });

  it("says there is no month before", () => {
    expect(comparisonCaption({ state: "no-history" })).toBe("אין חודש קודם להשוואה");
  });

  it("says the month before is only partly synced", () => {
    expect(comparisonCaption({ state: "incomplete-history" })).toBe(
      "החודש הקודם לא סונכרן במלואו, אז אין השוואה",
    );
  });

  it("says when the comparison appears", () => {
    expect(comparisonCaption({ state: "early", visibleFromDay: 7 })).toBe(
      "ההשוואה לחודש הקודם תופיע מה־7 בחודש",
    );
  });
});

describe("comparisonLabel", () => {
  it("names the same days of last month for a running month", () => {
    expect(
      comparisonLabel({ basis: "month-to-date", previousMonth: { year: 2026, month: 2 } }),
    ).toBe("אותם ימים בפברואר");
  });

  it("names the whole month before for a closed month", () => {
    expect(
      comparisonLabel({ basis: "whole-month", previousMonth: { year: 2025, month: 12 } }),
    ).toBe("דצמבר");
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
