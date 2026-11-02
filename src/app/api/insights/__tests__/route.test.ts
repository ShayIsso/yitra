import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/analytics", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/analytics")>();
  return {
    ...original,
    getMonthTransactionDetails: vi.fn(async () => []),
    getRollupCategories: vi.fn(async () => []),
    getAccountBalances: vi.fn(async () => []),
    buildInsightFacts: vi.fn(original.buildInsightFacts),
  };
});

vi.mock("@/lib/budgets", () => ({
  getBudgetStatuses: vi.fn(async () => []),
  getMonthlyTargets: vi.fn(async () => ({ expenseTarget: null, savingsTarget: null })),
}));

vi.mock("@/lib/recurring-detection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recurring-detection")>()),
  drizzleRecurringStore: {
    getPersistedPatterns: vi.fn(async () => []),
    getTransactionsForDetection: vi.fn(async () => []),
  },
}));

vi.mock("@/lib/transactions", () => ({
  getUncategorizedTransactionCount: vi.fn(async () => 0),
}));

vi.mock("@/lib/ai-categorization", () => ({
  createReviewStore: () => ({ getPendingSuggestionCount: async () => 0 }),
}));

import { buildInsightFacts } from "@/lib/analytics";
import { getBudgetStatuses } from "@/lib/budgets";
import { GET } from "../route";

const get = (query: string) => GET(new Request(`http://localhost:3000/api/insights${query}`));

describe("GET /api/insights", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.mocked(buildInsightFacts).mockClear();
    vi.mocked(getBudgetStatuses).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the month on the Israel calendar day while UTC is still on the previous one", async () => {
    // 22:30 UTC on May 31 is 01:30 on June 1 in Israel.
    vi.setSystemTime(new Date("2026-05-31T22:30:00Z"));
    const res = await get("?year=2026&month=6");
    expect(res.status).toBe(200);
    expect(vi.mocked(buildInsightFacts).mock.calls[0][0].today).toBe("2026-06-01");
    expect(getBudgetStatuses).toHaveBeenCalledWith(2026, 6, "2026-06-01");
  });

  it("rejects an invalid month with a 400", async () => {
    vi.setSystemTime(new Date("2026-06-15T09:00:00Z"));
    const res = await get("?year=2026&month=13");
    expect(res.status).toBe(400);
  });
});
