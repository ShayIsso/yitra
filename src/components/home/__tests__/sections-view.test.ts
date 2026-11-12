import { describe, it, expect } from "vitest";
import {
  attentionItems,
  balanceTone,
  budgetRing,
  debitDayHint,
  goalFillPercent,
  merchantBarPercents,
  expectsOnboarding,
  moreChargesLabel,
  onboardingBalances,
  onboardingFacts,
  relativeDayLabel,
  upcomingList,
  upcomingWhen,
  UPCOMING_SHOWN,
  type UpcomingCharge,
} from "@/components/home/sections/view";

function charge(overrides: Partial<UpcomingCharge> = {}): UpcomingCharge {
  return {
    id: "series-1",
    merchant: "invented-gym",
    displayName: null,
    expectedAmount: 120,
    cadence: "monthly",
    projectedDate: "2026-11-20",
    ...overrides,
  };
}

const NO_COUNTS = { uncategorized: 0, needsReview: 0, anomalies: 0, reviewQueue: 0 };

describe("attentionItems", () => {
  it("lists only non-zero queues, in a fixed order, with their real counts", () => {
    const items = attentionItems({ ...NO_COUNTS, reviewQueue: 2, uncategorized: 14 });
    expect(items.map((i) => [i.key, i.count])).toEqual([
      ["uncategorized", 14],
      ["reviewQueue", 2],
    ]);
  });

  it("is empty when nothing waits", () => {
    expect(attentionItems(NO_COUNTS)).toEqual([]);
  });

  it("deep-links each queue to its filtered view", () => {
    const items = attentionItems({
      uncategorized: 1,
      needsReview: 1,
      anomalies: 1,
      reviewQueue: 1,
    });
    expect(Object.fromEntries(items.map((i) => [i.key, i.href]))).toEqual({
      uncategorized: "/transactions?uncategorized=true",
      needsReview: "/transactions?needsReview=true",
      anomalies: "/subscriptions",
      reviewQueue: "/reconciliation",
    });
  });
});

describe("upcomingWhen", () => {
  const TODAY = "2026-11-12";

  it("marks a charge whose date has passed as late, by the outlook's rule (strictly before today)", () => {
    expect(upcomingWhen("2026-11-11", TODAY)).toEqual({ late: true });
    expect(upcomingWhen("2026-10-02", TODAY)).toEqual({ late: true });
  });

  it("counts a charge expected today as due today, not late", () => {
    expect(upcomingWhen(TODAY, TODAY)).toEqual({ late: false, inDays: 0 });
  });

  it("counts whole calendar days ahead, across a month end", () => {
    expect(upcomingWhen("2026-11-13", TODAY)).toEqual({ late: false, inDays: 1 });
    expect(upcomingWhen("2026-12-03", "2026-11-28")).toEqual({ late: false, inDays: 5 });
  });
});

describe("relativeDayLabel", () => {
  it("names today and tomorrow", () => {
    expect(relativeDayLabel(0)).toBe("היום");
    expect(relativeDayLabel(1)).toBe("מחר");
  });

  it("uses the Hebrew dual for two days", () => {
    expect(relativeDayLabel(2)).toBe("בעוד יומיים");
  });

  it("counts days up to a week ahead", () => {
    expect(relativeDayLabel(3)).toBe("בעוד 3 ימים");
    expect(relativeDayLabel(7)).toBe("בעוד 7 ימים");
  });

  it("leaves anything further to the date itself", () => {
    expect(relativeDayLabel(8)).toBeNull();
  });
});

describe("upcomingList", () => {
  it("keeps the endpoint's order and flags each row's lateness", () => {
    const { rows } = upcomingList(
      [
        charge({ id: "a", projectedDate: "2026-11-02" }),
        charge({ id: "b", projectedDate: "2026-11-15" }),
      ],
      "2026-11-12",
    );
    expect(rows.map((r) => [r.id, r.when.late])).toEqual([
      ["a", true],
      ["b", false],
    ]);
  });

  it("shows at most UPCOMING_SHOWN rows and counts the rest", () => {
    const charges = Array.from({ length: UPCOMING_SHOWN + 3 }, (_, i) => charge({ id: `s${i}` }));
    const { rows, hidden } = upcomingList(charges, "2026-11-12");
    expect(rows).toHaveLength(UPCOMING_SHOWN);
    expect(hidden).toBe(3);
  });
});

describe("balanceTone", () => {
  it("is neutral for zero and positive balances and negative below zero", () => {
    expect(balanceTone(0)).toEqual({ tone: "neutral", balance: 0 });
    expect(balanceTone(1520.4)).toEqual({ tone: "neutral", balance: 1520.4 });
    expect(balanceTone(-0.5)).toEqual({ tone: "negative", balance: -0.5 });
  });

  it("is unknown when the bank reported no balance", () => {
    expect(balanceTone(null)).toEqual({ tone: "unknown" });
  });
});

describe("debitDayHint", () => {
  it("reads an ISO date as an unpadded day.month", () => {
    expect(debitDayHint("2026-08-09")).toBe("9.8");
    expect(debitDayHint("2026-12-15")).toBe("15.12");
  });
});

describe("budgetRing", () => {
  it("fills by the spent fraction, clamped to a full ring", () => {
    expect(budgetRing({ spentFraction: 0.42, verdict: "on-pace" })).toMatchObject({
      fill: 0.42,
      percent: 42,
    });
    expect(budgetRing({ spentFraction: 1.35, verdict: "over" })).toMatchObject({
      fill: 1,
      percent: 135,
    });
  });

  it("has no percentage when a zero limit meets spend", () => {
    expect(budgetRing({ spentFraction: Infinity, verdict: "over" })).toMatchObject({
      fill: 1,
      percent: null,
    });
  });

  it("calls for attention only when at risk or over", () => {
    expect(budgetRing({ spentFraction: 0.9, verdict: "at-risk" }).attention).toBe(true);
    expect(budgetRing({ spentFraction: 1, verdict: "over" }).attention).toBe(true);
    expect(budgetRing({ spentFraction: 0.5, verdict: "on-pace" }).attention).toBe(false);
    expect(budgetRing({ spentFraction: 0.1, verdict: "comfortably-under" }).attention).toBe(false);
  });
});

describe("goalFillPercent", () => {
  it("is the capped fill as a percentage, never past 100 or below 0", () => {
    expect(goalFillPercent(2500, 10000)).toBe(25);
    expect(goalFillPercent(12000, 10000)).toBe(100);
    expect(goalFillPercent(-50, 10000)).toBe(0);
  });

  it("is 0 for a zero target", () => {
    expect(goalFillPercent(100, 0)).toBe(0);
  });
});

describe("merchantBarPercents", () => {
  it("draws each bar relative to the largest figure in the list", () => {
    expect(
      merchantBarPercents([
        { merchant: "a", amount: 400 },
        { merchant: "b", amount: 100 },
      ]),
    ).toEqual([100, 25]);
  });

  it("finds the largest even when the list is not sorted", () => {
    expect(
      merchantBarPercents([
        { merchant: "a", amount: 50 },
        { merchant: "b", amount: 200 },
      ]),
    ).toEqual([25, 100]);
  });

  it("is empty for an empty list", () => {
    expect(merchantBarPercents([])).toEqual([]);
  });
});

describe("onboardingFacts", () => {
  const success = [{ status: "success" as const }];
  const failed = [{ status: "error" as const }];

  it("is unknown until the attention counts are known", () => {
    expect(onboardingFacts(null, [], success)).toBeNull();
  });

  it("counts a successful run as the first sync done", () => {
    expect(onboardingFacts({ ...NO_COUNTS, uncategorized: 3 }, null, success)).toEqual({
      hasCredential: true,
      hasSuccessfulSync: true,
      uncategorizedCount: 3,
    });
  });

  it("counts stored balances as the first sync done when the latest run failed", () => {
    expect(onboardingFacts(NO_COUNTS, [{}], failed)?.hasSuccessfulSync).toBe(true);
  });

  it("is unknown when no run succeeded and the balances are not known yet", () => {
    expect(onboardingFacts(NO_COUNTS, null, failed)).toBeNull();
  });

  it("still shows the setup steps when the balances read failed (passed as [])", () => {
    expect(onboardingFacts(NO_COUNTS, [], failed)).toEqual({
      hasCredential: true,
      hasSuccessfulSync: false,
      uncategorizedCount: 0,
    });
  });

  it("reports no first sync when no run succeeded and nothing was stored", () => {
    expect(onboardingFacts(NO_COUNTS, [], failed)?.hasSuccessfulSync).toBe(false);
  });
});

describe("moreChargesLabel", () => {
  it("is singular for one hidden charge and counts the rest", () => {
    expect(moreChargesLabel(1)).toBe("עוד חיוב אחד");
    expect(moreChargesLabel(3)).toBe("עוד 3 חיובים");
  });
});

describe("onboardingBalances", () => {
  it("passes an answer through", () => {
    expect(onboardingBalances([{}], false)).toEqual([{}]);
  });

  it("reads a failed read as known-empty, so the setup facts can still be judged", () => {
    expect(onboardingBalances(null, true)).toEqual([]);
  });

  it("is unknown while the read is pending", () => {
    expect(onboardingBalances(null, false)).toBeNull();
  });
});

describe("expectsOnboarding", () => {
  it("expects the setup card when runs are known and none succeeded", () => {
    expect(expectsOnboarding([{ status: "error" }, { status: "otp_skipped" }])).toBe(true);
  });

  it("does not once any run succeeded", () => {
    expect(expectsOnboarding([{ status: "error" }, { status: "success" }])).toBe(false);
  });

  it("does not when the runs are unknown (a failed read hands [])", () => {
    expect(expectsOnboarding([])).toBe(false);
  });
});
