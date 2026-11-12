import { describe, it, expect } from "vitest";
import {
  homeHref,
  homeMonthOf,
  monthWindow,
  parseMonthParam,
  shiftMonth,
  swipeStep,
} from "@/components/home/month";

const NOV = { year: 2026, month: 11 };

describe("parseMonthParam", () => {
  it("reads a YYYY-MM month", () => {
    expect(parseMonthParam("2026-09", NOV)).toEqual({ year: 2026, month: 9 });
  });

  it("falls back to the current month without a param", () => {
    expect(parseMonthParam(null, NOV)).toEqual(NOV);
  });

  it.each(["2026-13", "2026-00", "26-09", "2026-9", "september", "2026-09-01"])(
    "falls back to the current month for %s",
    (value) => {
      expect(parseMonthParam(value, NOV)).toEqual(NOV);
    },
  );

  it("never lands on a month that hasn't started", () => {
    expect(parseMonthParam("2026-12", NOV)).toEqual(NOV);
    expect(parseMonthParam("2027-01", NOV)).toEqual(NOV);
  });
});

describe("homeHref", () => {
  it("is the bare home path for the current month", () => {
    expect(homeHref(NOV, NOV)).toBe("/");
  });

  it("carries any other month in the URL", () => {
    expect(homeHref({ year: 2025, month: 3 }, NOV)).toBe("/?month=2025-03");
  });
});

describe("shiftMonth", () => {
  it("crosses year boundaries both ways", () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2025, month: 12 }, 1)).toEqual({ year: 2026, month: 1 });
    expect(shiftMonth(NOV, -14)).toEqual({ year: 2025, month: 9 });
  });
});

describe("monthWindow", () => {
  it("ends at the current month, oldest first, while the selection is recent", () => {
    expect(monthWindow({ year: 2026, month: 9 }, NOV)).toEqual([
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
    ]);
  });

  it("centres an older selection", () => {
    expect(monthWindow({ year: 2026, month: 2 }, NOV)).toEqual([
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
      { year: 2026, month: 3 },
      { year: 2026, month: 4 },
    ]);
  });
});

describe("swipeStep", () => {
  // RTL pager: later months sit to the left, so dragging rightwards pulls the next month in.
  it("moves to the next month on a rightward swipe", () => {
    expect(swipeStep(80, 5)).toBe(1);
  });

  it("moves to the previous month on a leftward swipe", () => {
    expect(swipeStep(-80, 5)).toBe(-1);
  });

  it("ignores short drags and mostly vertical scrolls", () => {
    expect(swipeStep(30, 0)).toBe(0);
    expect(swipeStep(80, 70)).toBe(0);
  });
});

describe("homeMonthOf", () => {
  it("is the month in Israel, which runs ahead of UTC", () => {
    expect(homeMonthOf(new Date("2026-10-31T22:30:00Z"))).toEqual(NOV);
  });
});
