import { describe, it, expect } from "vitest";
import { groupByDay, dayLabel } from "../feed-days";

describe("groupByDay", () => {
  it("groups consecutive rows of the same date, keeping the listing's order", () => {
    const rows = [
      { id: "a", date: "2026-05-14" },
      { id: "b", date: "2026-05-14" },
      { id: "c", date: "2026-05-12" },
    ];
    expect(groupByDay(rows)).toEqual([
      { day: "2026-05-14", rows: [rows[0], rows[1]] },
      { day: "2026-05-12", rows: [rows[2]] },
    ]);
  });

  it("returns no groups for no rows", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("dayLabel", () => {
  const today = new Date(2026, 4, 14, 9, 30);

  it("names today", () => {
    expect(dayLabel("2026-05-14", today)).toBe("היום");
  });

  it("names yesterday, across a month boundary too", () => {
    expect(dayLabel("2026-05-13", today)).toBe("אתמול");
    expect(dayLabel("2026-04-30", new Date(2026, 4, 1))).toBe("אתמול");
  });

  it("writes an older day as weekday, day and month", () => {
    expect(dayLabel("2026-05-10", today)).toBe("יום ראשון, 10 במאי");
  });

  it("adds the year for a day outside the current year", () => {
    expect(dayLabel("2025-12-31", today)).toBe("יום רביעי, 31 בדצמבר 2025");
  });
});
