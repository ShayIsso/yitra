import { describe, it, expect } from "vitest";
import {
  historyCompleteSince,
  isComparisonHistoryComplete,
  isMonthHistoryComplete,
} from "../history-coverage";

const SEPTEMBER = { year: 2026, month: 9 };
const OCTOBER = { year: 2026, month: 10 };
const NOVEMBER = { year: 2026, month: 11 };

describe("historyCompleteSince", () => {
  it("is the latest credential's earliest row, each credential over all its accounts", () => {
    expect(
      historyCompleteSince([
        { credentialId: "bank", earliest: "2025-11-12" },
        { credentialId: "card", earliest: "2025-12-03" },
        // A replacement card under the same login starts later without a gap.
        { credentialId: "card", earliest: "2026-06-01" },
      ]),
    ).toBe("2025-12-03");
  });

  it("is null before anything is stored", () => {
    expect(historyCompleteSince([])).toBeNull();
  });
});

describe("isMonthHistoryComplete", () => {
  it("needs the history to reach the month's first day", () => {
    expect(isMonthHistoryComplete(OCTOBER, "2026-10-01")).toBe(true);
    expect(isMonthHistoryComplete(OCTOBER, "2026-10-05")).toBe(false);
    expect(isMonthHistoryComplete(OCTOBER, null)).toBe(false);
  });
});

describe("isComparisonHistoryComplete", () => {
  const bank = { credentialId: "bank", earliest: "2025-11-14" };

  it("compares months every credential's history covers", () => {
    expect(isComparisonHistoryComplete(SEPTEMBER, OCTOBER, [bank])).toBe(true);
  });

  it("does not compare when a credential's history begins inside the two months", () => {
    // The first sync reached this credential only from Sep 10.
    const partial = { credentialId: "card", earliest: "2026-09-10" };
    expect(isComparisonHistoryComplete(SEPTEMBER, OCTOBER, [bank, partial])).toBe(false);
    expect(isComparisonHistoryComplete({ year: 2026, month: 8 }, SEPTEMBER, [bank, partial])).toBe(
      false,
    );
  });

  it("is not held back by a rarely used card whose first row comes after the two months", () => {
    const dormant = { credentialId: "card", earliest: "2026-11-05" };
    expect(isComparisonHistoryComplete(SEPTEMBER, OCTOBER, [bank, dormant])).toBe(true);
    // The month it first appears in is ambiguous (a sync edge looks the same), so it waits.
    expect(isComparisonHistoryComplete(OCTOBER, NOVEMBER, [bank, dormant])).toBe(false);
  });
});
