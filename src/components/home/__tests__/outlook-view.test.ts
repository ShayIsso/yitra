import { describe, it, expect } from "vitest";
import {
  closedVerdict,
  equationTerms,
  syncedAsOf,
  type ActiveOutlook,
  type ClosedOutlook,
} from "@/components/home/outlook-view";

// All figures invented.
function closed(over: Partial<ClosedOutlook> = {}): ClosedOutlook {
  return {
    state: "closed",
    income: 12000,
    expenses: 9000,
    net: 3000,
    target: null,
    overBy: null,
    asOf: "2026-11-10T08:00:00.000Z",
    stale: false,
    ...over,
  };
}

describe("closedVerdict", () => {
  it("says more came in than went out", () => {
    expect(closedVerdict(closed())).toEqual({ balance: "surplus", by: 3000, target: null });
  });

  it("says more went out than came in", () => {
    expect(closedVerdict(closed({ income: 8000, net: -1000 }))).toMatchObject({
      balance: "deficit",
      by: 1000,
    });
  });

  it("reads a month that nets to zero as even", () => {
    expect(closedVerdict(closed({ income: 9000, net: 0 })).balance).toBe("even");
  });

  it("reads a month with no income or expenses as empty, not even", () => {
    expect(closedVerdict(closed({ income: 0, expenses: 0, net: 0 })).balance).toBe("empty");
  });

  it("states the overage against the target", () => {
    expect(closedVerdict(closed({ target: 8000, overBy: 1000 })).target).toEqual({
      over: 1000,
    });
  });

  it("states the target the month stayed within", () => {
    expect(closedVerdict(closed({ target: 10000 })).target).toEqual({ within: 10000 });
  });
});

function active(over: Partial<ActiveOutlook> = {}): ActiveOutlook {
  return {
    state: "active",
    target: 8000,
    spent: 3100,
    dueRecurring: 900,
    dueCharges: [
      {
        id: "a",
        amount: 600,
        expectedDate: "2026-11-20",
        arrived: false,
        awaitingCategory: false,
        cadence: "monthly",
        late: false,
      },
      {
        id: "b",
        amount: 300,
        expectedDate: "2026-11-02",
        arrived: false,
        awaitingCategory: false,
        cadence: "monthly",
        late: true,
      },
    ],
    remaining: 4000,
    daysLeft: 19,
    perDay: 210.53,
    overBy: null,
    projection: null,
    crossingDate: null,
    projectionBasis: null,
    asOf: "2026-11-12T06:00:00.000Z",
    stale: false,
    ...over,
  };
}

describe("equationTerms", () => {
  it("lays out target − spent − due = remaining from the returned figures", () => {
    expect(equationTerms(active())).toEqual([
      { term: "target", amount: 8000 },
      { term: "spent", amount: 3100 },
      { term: "due", amount: 900, count: 2, late: 1 },
      { term: "remaining", amount: 4000 },
    ]);
  });

  it("keeps an overspent month's negative remaining in the equation", () => {
    const over = active({ spent: 8500, remaining: -1400, overBy: 1400, perDay: 0 });
    expect(equationTerms(over).at(-1)).toEqual({ term: "remaining", amount: -1400 });
  });
});

describe("syncedAsOf", () => {
  it("reads when a month's figures were synced and whether that is stale", () => {
    expect(syncedAsOf(closed({ stale: true }))).toEqual({
      asOf: "2026-11-10T08:00:00.000Z",
      stale: true,
    });
  });

  it("has nothing before a first success", () => {
    expect(syncedAsOf({ state: "no-connection" })).toEqual({ asOf: null, stale: false });
    expect(syncedAsOf(null)).toEqual({ asOf: null, stale: false });
  });
});
