import { describe, it, expect } from "vitest";
import { countedThroughToday, monthToDateWindow } from "../month-to-date";

const MARCH = { year: 2026, month: 3 };
const at = (date: string) => ({ date });

describe("countedThroughToday", () => {
  const rows = [at("2026-03-02"), at("2026-03-15"), at("2026-03-28")];

  it("counts a running month's rows through today: a row dated ahead is not spent yet", () => {
    expect(countedThroughToday(MARCH, "2026-03-15", rows)).toEqual(rows.slice(0, 2));
  });

  it("counts a closed month whole", () => {
    expect(countedThroughToday(MARCH, "2026-04-01", rows)).toEqual(rows);
  });

  it("counts nothing for a month that has not started", () => {
    expect(countedThroughToday(MARCH, "2026-02-27", rows)).toEqual([]);
  });
});

describe("monthToDateWindow", () => {
  const month = [at("2026-03-03"), at("2026-03-20")];
  const previous = [at("2026-02-03"), at("2026-02-12"), at("2026-02-27")];

  it("cuts a running month and the month before at the same day", () => {
    expect(monthToDateWindow(MARCH, "2026-03-12", { month, previous })).toEqual({
      basis: "month-to-date",
      month: [month[0]],
      previous: previous.slice(0, 2),
    });
  });

  it("compares a closed month whole with the whole month before", () => {
    expect(monthToDateWindow(MARCH, "2026-05-01", { month, previous })).toEqual({
      basis: "whole-month",
      month,
      previous,
    });
  });

  it("has no window for a month that has not started", () => {
    expect(monthToDateWindow(MARCH, "2026-02-27", { month, previous })).toBeNull();
  });
});
