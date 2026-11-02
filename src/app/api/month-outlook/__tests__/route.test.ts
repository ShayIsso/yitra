import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/budgets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/budgets")>()),
  getMonthOutlook: vi.fn(),
}));

import { getMonthOutlook } from "@/lib/budgets";
import { GET } from "../route";

const outlook = vi.mocked(getMonthOutlook);
const HEBREW = /[֐-׿]/;

const get = (query: string) => GET(new Request(`http://localhost:3000/api/month-outlook${query}`));

describe("GET /api/month-outlook", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T09:00:00Z"));
    outlook.mockReset();
    outlook.mockResolvedValue({ state: "no-connection" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the outlook for a valid month", async () => {
    const res = await get("?year=2026&month=5");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "no-connection" });
    expect(outlook).toHaveBeenCalledWith(2026, 5);
  });

  it("accepts the current month", async () => {
    const res = await get("?year=2026&month=6");
    expect(res.status).toBe(200);
    expect(outlook).toHaveBeenCalledWith(2026, 6);
  });

  it("accepts a month that has begun in Israel while it is still the previous month in UTC", async () => {
    // 22:30 UTC on May 31 is 01:30 on June 1 in Israel.
    vi.setSystemTime(new Date("2026-05-31T22:30:00Z"));
    const res = await get("?year=2026&month=6");
    expect(res.status).toBe(200);
    expect(outlook).toHaveBeenCalledWith(2026, 6);
  });

  it.each([
    [""],
    ["?year=2026"],
    ["?month=5"],
    ["?year=2026&month=13"],
    ["?year=2026&month=0"],
    ["?year=abc&month=5"],
    ["?year=1999&month=12"],
  ])("rejects %s with a Hebrew 400", async (query) => {
    const res = await get(query);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(HEBREW);
    expect(outlook).not.toHaveBeenCalled();
  });

  it("rejects a month that hasn't started", async () => {
    const res = await get("?year=2026&month=7");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(HEBREW);
    expect(outlook).not.toHaveBeenCalled();
  });
});
