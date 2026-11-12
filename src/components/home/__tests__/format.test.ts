import { describe, it, expect } from "vitest";
import { formatDayMonth } from "@/components/home/format";

describe("formatDayMonth", () => {
  it("drops the year and the leading zeros", () => {
    expect(formatDayMonth("2026-08-09")).toBe("9.8");
  });

  it("keeps two-digit days and months whole", () => {
    expect(formatDayMonth("2026-12-31")).toBe("31.12");
  });
});
