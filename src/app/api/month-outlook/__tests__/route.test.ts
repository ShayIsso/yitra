import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/budgets", () => ({
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
    const res = await get("?month=2026-05");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "no-connection" });
    expect(outlook).toHaveBeenCalledWith(2026, 5);
  });

  it("accepts the current month", async () => {
    const res = await get("?month=2026-06");
    expect(res.status).toBe(200);
    expect(outlook).toHaveBeenCalledWith(2026, 6);
  });

  it.each([[""], ["?month=2026-13"], ["?month=2026-6"], ["?month=june"], ["?month=1999-12"]])(
    "rejects %s with a Hebrew 400",
    async (query) => {
      const res = await get(query);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(HEBREW);
      expect(outlook).not.toHaveBeenCalled();
    },
  );

  it("rejects a month that hasn't started", async () => {
    const res = await get("?month=2026-07");
    expect(res.status).toBe(400);
    expect(outlook).not.toHaveBeenCalled();
  });

  it("reports one reason for a malformed month", async () => {
    const res = await get("?month=june");
    expect((await res.json()).error).toBe("חודש לא תקין (YYYY-MM)");
  });
});
