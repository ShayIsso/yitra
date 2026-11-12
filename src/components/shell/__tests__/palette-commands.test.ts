import { describe, it, expect } from "vitest";
import { ALL_DESTINATIONS } from "../nav";
import { homeMonthRange } from "@/components/home/month";
import { groupCommands, paletteCommands, type PaletteCommand } from "../palette/commands";
import { buildSearchIndex, search } from "../palette/search";

const find = (commands: PaletteCommand[], query: string) =>
  search(buildSearchIndex(commands), query);

const nov2026 = { year: 2026, month: 11 };
/** Data back to 2020: the month floor is out of the way. */
const RANGE = { first: { year: 2020, month: 1 }, current: nov2026 };
const inGroup = (commands: PaletteCommand[], group: PaletteCommand["group"]) =>
  commands.filter((c) => c.group === group);

describe("paletteCommands, pages", () => {
  it("offers every shell destination, in the shell's order", () => {
    const pages = inGroup(paletteCommands(RANGE), "pages");
    expect(pages.map((p) => p.href)).toEqual(ALL_DESTINATIONS.map((d) => d.href));
    expect(pages.map((p) => p.label)).toEqual(ALL_DESTINATIONS.map((d) => d.label));
  });

  it("finds every page by its English name too", () => {
    const commands = paletteCommands(RANGE);
    const english: Record<string, string> = {
      "/": "home",
      "/transactions": "transactions",
      "/reports": "reports",
      "/reconciliation": "reconciliation",
      "/subscriptions": "subscriptions",
      "/sync": "sync",
      "/settings": "settings",
    };
    expect(Object.keys(english)).toEqual(ALL_DESTINATIONS.map((d) => d.href));
    for (const [href, name] of Object.entries(english)) {
      expect(find(commands, name)[0]?.href).toBe(href);
    }
  });
});

describe("paletteCommands, months", () => {
  /** The months offered when the data spans `monthsWithData`, through home's own range. */
  const months = (monthsWithData: { year: number; month: number }[]) =>
    inGroup(paletteCommands(homeMonthRange(monthsWithData, nov2026)), "months");

  it("offers the home screen's recent months, newest first, through the home URL", () => {
    expect(months([nov2026, { year: 2026, month: 8 }]).map((m) => [m.label, m.href])).toEqual([
      ["נובמבר 2026", "/"],
      ["אוקטובר 2026", "/?month=2026-10"],
      ["ספטמבר 2026", "/?month=2026-09"],
      ["אוגוסט 2026", "/?month=2026-08"],
    ]);
  });

  it("stops at a year back when the data goes further", () => {
    const hrefs = months([nov2026, { year: 2020, month: 1 }]).map((m) => m.href);
    expect(hrefs).toHaveLength(12);
    expect(hrefs.at(-1)).toBe("/?month=2025-12");
  });

  it("offers a year back when there is no data yet, as home browses back to its own floor", () => {
    expect(
      months([])
        .map((m) => m.href)
        .at(-1),
    ).toBe("/?month=2025-12");
  });

  it("offers only the current month when the only data is ahead of it", () => {
    expect(months([{ year: 2027, month: 2 }]).map((m) => m.href)).toEqual(["/"]);
  });

  it("names the current and the previous month so either can be found by name", () => {
    const [current, previous, older] = months([]);
    expect(current.hint).toBe("החודש");
    expect(previous.hint).toBe("החודש שעבר");
    expect(older.hint).toBeUndefined();
  });
});

describe("searching the palette's commands", () => {
  const commands = paletteCommands(RANGE);
  const hrefs = (query: string) => find(commands, query).map((c) => c.href);

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

describe("groupCommands", () => {
  const commands = paletteCommands(RANGE);

  it("lists pages, transaction views and months, under their headings, when nothing is typed", () => {
    expect(groupCommands(commands).map((g) => g.label)).toEqual(["עמודים", "תנועות", "חודשים"]);
  });

  it("puts the group holding the best match first and keeps each group's ranking", () => {
    const groups = groupCommands(find(commands, "החודש שעבר"));
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
    const filters = inGroup(paletteCommands(RANGE), "transactions");
    expect(filters.map((f) => [f.label, f.href])).toEqual([
      ["ממתינות לסקירה", "/transactions?needsReview=true"],
      ["ללא קטגוריה", "/transactions?uncategorized=true"],
      ["תנועות החודש", "/transactions?month=2026-11"],
      ["תנועות החודש שעבר", "/transactions?month=2026-10"],
      ["תנועות בהמתנה", "/transactions?status=pending"],
    ]);
  });

  it("reads 'last month' across a year boundary", () => {
    const filters = paletteCommands({ first: RANGE.first, current: { year: 2027, month: 1 } });
    expect(filters.find((f) => f.label === "תנועות החודש שעבר")?.href).toBe(
      "/transactions?month=2026-12",
    );
  });
});
