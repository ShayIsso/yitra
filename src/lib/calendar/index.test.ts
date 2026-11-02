import { describe, it, expect } from "vitest";
import { israelCalendarDay } from "@/lib/calendar";

describe("israelCalendarDay", () => {
  it("is already the next day in Israel while UTC is still on the previous one", () => {
    expect(israelCalendarDay(new Date("2026-05-31T22:30:00Z"))).toBe("2026-06-01");
  });

  it("follows Israel's winter offset too", () => {
    expect(israelCalendarDay(new Date("2026-12-31T21:59:00Z"))).toBe("2026-12-31");
    expect(israelCalendarDay(new Date("2026-12-31T22:00:00Z"))).toBe("2027-01-01");
  });
});
