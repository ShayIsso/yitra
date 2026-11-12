import { describe, it, expect } from "vitest";
import { comparableSavingsRate, monthChange } from "../month-metrics";

describe("monthChange", () => {
  it("states a rise in shekels and as a share of the earlier figure", () => {
    expect(monthChange(6600, 6000)).toEqual({ amount: 600, percent: 10 });
  });

  it("measures a fall against the size of a negative base, so its sign follows the move", () => {
    // Net savings −2,000 → −3,000 fell by half of the base.
    expect(monthChange(-3000, -2000)).toEqual({ amount: -1000, percent: -50 });
  });

  it("gives no percent off a base too small for a ratio to mean anything", () => {
    expect(monthChange(900, 20)).toEqual({ amount: 880, percent: null });
    expect(monthChange(500, 0)).toEqual({ amount: 500, percent: null });
  });

  it("gives no percent when the ratio runs into the thousands", () => {
    expect(monthChange(25000, 1000)).toEqual({ amount: 24000, percent: null });
  });

  it("rounds the shekel change to agorot, so cancelling figures are exactly flat", () => {
    expect(monthChange(30.3, 10.1 + 20.2)).toEqual({ amount: 0, percent: null });
  });
});

describe("comparableSavingsRate", () => {
  it("is the share of income saved, in percent", () => {
    expect(comparableSavingsRate(10000, 2500)).toBe(25);
  });

  it("is no figure at all when nothing came in, never a 0%", () => {
    expect(comparableSavingsRate(0, -3200)).toBeNull();
    expect(comparableSavingsRate(0, 0)).toBeNull();
  });

  it("is no figure when net income is negative (a reversed salary outweighs it)", () => {
    expect(comparableSavingsRate(-500, -4500)).toBeNull();
  });

  it("is not comparable when a sliver of income turns it absurd", () => {
    // ₪300 of interest against ₪9,000 of spending is −2,900%, not a savings rate.
    expect(comparableSavingsRate(300, -8700)).toBeNull();
    // A net-refund month (expenses below zero) saves more than came in.
    expect(comparableSavingsRate(4000, 4600)).toBeNull();
  });

  it("keeps the edges of the comparable range", () => {
    expect(comparableSavingsRate(5000, -5000)).toBe(-100);
    expect(comparableSavingsRate(5000, 5000)).toBe(100);
  });
});
