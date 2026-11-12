import { describe, it, expect } from "vitest";
import { ALL_DESTINATIONS } from "../nav";
import {
  firstMonthWithData,
  groupCommands,
  paletteCommands,
  type PaletteCommand,
} from "../palette/commands";
import { searchCommands } from "../palette/search";

const nov2026 = { year: 2026, month: 11 };
const inGroup = (commands: PaletteCommand[], group: PaletteCommand["group"]) =>
  commands.filter((c) => c.group === group);

describe("paletteCommands, pages", () => {
  it("offers every shell destination, in the shell's order", () => {
    const pages = inGroup(paletteCommands({ current: nov2026, first: null }), "pages");
    expect(pages.map((p) => p.href)).toEqual(ALL_DESTINATIONS.map((d) => d.href));
    expect(pages.map((p) => p.label)).toEqual(ALL_DESTINATIONS.map((d) => d.label));
  });
});

describe("paletteCommands, months", () => {
  const months = (first: { year: number; month: number } | null) =>
    inGroup(paletteCommands({ current: nov2026, first }), "months");

  it("offers the home screen's recent months, newest first, through the home URL", () => {
    expect(months({ year: 2026, month: 8 }).map((m) => [m.label, m.href])).toEqual([
      ["נובמבר 2026", "/"],
      ["אוקטובר 2026", "/?month=2026-10"],
      ["ספטמבר 2026", "/?month=2026-09"],
      ["אוגוסט 2026", "/?month=2026-08"],
    ]);
  });

  it("stops at a year back when the data goes further", () => {
    const hrefs = months({ year: 2020, month: 1 }).map((m) => m.href);
    expect(hrefs).toHaveLength(12);
    expect(hrefs.at(-1)).toBe("/?month=2025-12");
  });

  it("offers a year back when the first month with data is unknown", () => {
    expect(
      months(null)
        .map((m) => m.href)
        .at(-1),
    ).toBe("/?month=2025-12");
  });

  it("never offers a month after the current one", () => {
    expect(months({ year: 2027, month: 2 }).map((m) => m.href)).toEqual(["/"]);
  });

  it("names the current and the previous month so either can be found by name", () => {
    const [current, previous, older] = months(null);
    expect(current.hint).toBe("החודש");
    expect(previous.hint).toBe("החודש שעבר");
    expect(older.hint).toBeUndefined();
  });
});

describe("searching the palette's commands", () => {
  const commands = paletteCommands({ current: nov2026, first: null });
  const hrefs = (query: string) => searchCommands(commands, query).map((c) => c.href);

  it("finds the previous month by its hint as well as by its name", () => {
    expect(hrefs("החודש שעבר")).toEqual(["/transactions?month=2026-10", "/?month=2026-10"]);
    expect(hrefs("אוקטובר")).toEqual(["/?month=2026-10"]);
  });

  it("finds a month by its numeric form", () => {
    expect(hrefs("9/2026")).toEqual(["/?month=2026-09"]);
  });

  it("finds a page by its English name", () => {
    expect(hrefs("settings")).toEqual(["/settings"]);
  });
});

describe("firstMonthWithData", () => {
  it("reads the oldest month from the reports months answer (newest first)", () => {
    const answer = [
      { year: 2026, month: 11 },
      { year: 2026, month: 3 },
      { year: 2025, month: 12 },
    ];
    expect(firstMonthWithData(answer)).toEqual({ year: 2025, month: 12 });
  });

  it("knows no floor when there is no data or the answer is malformed", () => {
    expect(firstMonthWithData([])).toBeNull();
    expect(firstMonthWithData({ error: "x" })).toBeNull();
    expect(firstMonthWithData([{ year: "2026", month: 1 }])).toBeNull();
    expect(firstMonthWithData([{ year: 2026, month: 13 }])).toBeNull();
  });
});

describe("groupCommands", () => {
  const commands = paletteCommands({ current: nov2026, first: null });

  it("lists pages, transaction views and months, under their headings, when nothing is typed", () => {
    expect(groupCommands(commands).map((g) => g.label)).toEqual(["עמודים", "תנועות", "חודשים"]);
  });

  it("puts the group holding the best match first and keeps each group's ranking", () => {
    const groups = groupCommands(searchCommands(commands, "החודש שעבר"));
    expect(groups.map((g) => [g.group, g.commands.map((c) => c.href)])).toEqual([
      ["transactions", ["/transactions?month=2026-10"]],
      ["months", ["/?month=2026-10"]],
    ]);
  });

  it("returns no groups for no commands", () => {
    expect(groupCommands([])).toEqual([]);
  });
});

describe("paletteCommands, transaction filters", () => {
  it("links the common views through the transactions page's own URL contract", () => {
    const filters = inGroup(paletteCommands({ current: nov2026, first: null }), "transactions");
    expect(filters.map((f) => [f.label, f.href])).toEqual([
      ["ממתינות לסקירה", "/transactions?needsReview=true"],
      ["ללא קטגוריה", "/transactions?uncategorized=true"],
      ["תנועות החודש", "/transactions?month=2026-11"],
      ["תנועות החודש שעבר", "/transactions?month=2026-10"],
      ["תנועות בהמתנה", "/transactions?status=pending"],
    ]);
  });

  it("reads 'last month' across a year boundary", () => {
    const filters = paletteCommands({ current: { year: 2027, month: 1 }, first: null });
    expect(filters.find((f) => f.label === "תנועות החודש שעבר")?.href).toBe(
      "/transactions?month=2026-12",
    );
  });
});
