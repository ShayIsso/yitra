import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  getTransactionDetailsBetween: vi.fn(async () => []),
  getRollupCategories: vi.fn(async () => []),
}));

vi.mock("@/lib/budgets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/budgets")>()),
  getAccountHistoryStarts: vi.fn(async () => []),
}));

vi.mock("@/lib/reports", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/reports")>();
  return { ...original, buildHomeTrends: vi.fn(original.buildHomeTrends) };
});

import { getRollupCategories, getTransactionDetailsBetween } from "@/lib/analytics";
import { getAccountHistoryStarts } from "@/lib/budgets";
import { buildHomeTrends } from "@/lib/reports";
import { GET } from "../route";

const get = (query: string) => GET(new Request(`http://localhost:3000/api/home-trends${query}`));

describe("GET /api/home-trends", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.mocked(buildHomeTrends).mockClear();
    vi.mocked(getTransactionDetailsBetween).mockClear();
    vi.mocked(getRollupCategories).mockClear();
    vi.mocked(getAccountHistoryStarts).mockClear();
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

  it("reads the window's rows, the categories and the history coverage once each", async () => {
    vi.setSystemTime(new Date("2026-06-15T09:00:00Z"));
    const res = await get("?year=2026&month=2");
    expect(getTransactionDetailsBetween).toHaveBeenCalledTimes(1);
    expect(getTransactionDetailsBetween).toHaveBeenCalledWith("2025-07-01", "2026-06-30");
    expect(getRollupCategories).toHaveBeenCalledTimes(1);
    expect(getAccountHistoryStarts).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.months).toHaveLength(12);
    // July 2025 … June 2026: February is the eighth month.
    expect(body.selectedIndex).toBe(7);
  });

  it("ends the window at an older month itself", async () => {
    vi.setSystemTime(new Date("2026-06-15T09:00:00Z"));
    await get("?year=2024&month=3");
    expect(getTransactionDetailsBetween).toHaveBeenCalledWith("2023-04-01", "2024-03-31");
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
