import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  getMonthTransactionDetails: vi.fn(async () => []),
  getRollupCategories: vi.fn(async () => []),
}));

vi.mock("@/lib/reports", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/reports")>();
  return {
    ...original,
    getTrendsReport: vi.fn(async (range: number, _store: unknown, today: string) =>
      original.buildTrendsReport(
        original.enumerateMonthRange(today, range).map((m) => ({ ...m, transactions: [] })),
        [],
      ),
    ),
    buildHomeTrends: vi.fn(original.buildHomeTrends),
  };
});

import { getMonthTransactionDetails } from "@/lib/analytics";
import { buildHomeTrends, getTrendsReport } from "@/lib/reports";
import { GET } from "../route";

const get = (query: string) => GET(new Request(`http://localhost:3000/api/home-trends${query}`));

describe("GET /api/home-trends", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.mocked(buildHomeTrends).mockClear();
    vi.mocked(getTrendsReport).mockClear();
    vi.mocked(getMonthTransactionDetails).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("judges the month on the Israel calendar day while UTC is still on the previous one", async () => {
    // 22:30 UTC on May 31 is 01:30 on June 1 in Israel.
    vi.setSystemTime(new Date("2026-05-31T22:30:00Z"));
    const res = await get("?year=2026&month=6");
    expect(res.status).toBe(200);
    expect(vi.mocked(buildHomeTrends).mock.calls[0][0].today).toBe("2026-06-01");
  });

  it("reads the selected month and the one before it", async () => {
    vi.setSystemTime(new Date("2026-06-15T09:00:00Z"));
    await get("?year=2026&month=1");
    expect(getMonthTransactionDetails).toHaveBeenCalledWith(2026, 1);
    expect(getMonthTransactionDetails).toHaveBeenCalledWith(2025, 12);
  });

  it("reads twelve months ending at the current month for a recent month", async () => {
    vi.setSystemTime(new Date("2026-06-15T09:00:00Z"));
    const res = await get("?year=2026&month=2");
    expect(vi.mocked(getTrendsReport).mock.calls[0]).toEqual([12, undefined, "2026-06-01"]);
    const body = await res.json();
    expect(body.months).toHaveLength(12);
    // July 2025 … June 2026: February is the eighth month.
    expect(body.selectedIndex).toBe(7);
  });

  it("ends the window at an older month itself", async () => {
    vi.setSystemTime(new Date("2026-06-15T09:00:00Z"));
    await get("?year=2024&month=3");
    expect(vi.mocked(getTrendsReport).mock.calls[0][2]).toBe("2024-03-01");
  });

  it("refuses a month that has not started", async () => {
    vi.setSystemTime(new Date("2026-06-15T09:00:00Z"));
    const res = await get("?year=2026&month=7");
    expect(res.status).toBe(400);
    expect(buildHomeTrends).not.toHaveBeenCalled();
  });

  it("rejects an invalid month with a 400", async () => {
    vi.setSystemTime(new Date("2026-06-15T09:00:00Z"));
    const res = await get("?year=2026&month=13");
    expect(res.status).toBe(400);
  });
});
