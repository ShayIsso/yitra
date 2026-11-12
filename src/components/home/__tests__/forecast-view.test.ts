import { describe, it, expect } from "vitest";
import {
  axisTicks,
  dayAtOffset,
  forecastGeometry,
  forecastPoint,
  forecastView,
  scrubDay,
  thinHistoryNeed,
} from "@/components/home/forecast-view";
import type { ActiveOutlook } from "@/components/home/outlook-view";

const NOV = { year: 2026, month: 11 };

// All figures invented. A 30-day month seen on day 4.
function active(over: Partial<ActiveOutlook> = {}): ActiveOutlook {
  return {
    state: "active",
    target: 6000,
    spent: 900,
    dueRecurring: 1200,
    dueCharges: [],
    remaining: 3900,
    daysLeft: 27,
    perDay: 144.44,
    overBy: null,
    projection: {
      total: 5320,
      actual: [200, 450, 700, 900],
      projected: [900, ...Array.from({ length: 26 }, (_, i) => 1070 + i * 170)],
    },
    crossingDate: null,
    projectionBasis: "this-month-pace",
    asOf: "2026-11-04T08:00:00.000Z",
    stale: false,
    ...over,
  };
}

describe("forecastView", () => {
  it("has nothing to draw without a projection", () => {
    expect(forecastView(active({ projection: null, projectionBasis: null }), NOV)).toBeNull();
  });

  it("places today where the actual series ends and the month where the projection ends", () => {
    expect(forecastView(active(), NOV)).toMatchObject({ today: 4, daysInMonth: 30 });
  });

  it("reads the crossing as a day of the month", () => {
    expect(forecastView(active({ crossingDate: "2026-11-23" }), NOV)?.crossingDay).toBe(23);
  });

  it("has no crossing when the outlook names none", () => {
    expect(forecastView(active(), NOV)?.crossingDay).toBeNull();
  });

  it("is at risk when the projection crosses the target", () => {
    expect(forecastView(active({ crossingDate: "2026-11-23" }), NOV)?.atRisk).toBe(true);
  });

  it("is at risk when the month is already over target", () => {
    expect(forecastView(active({ remaining: -300, overBy: 300 }), NOV)?.atRisk).toBe(true);
  });

  it("is not at risk when the projection stays under the target", () => {
    expect(forecastView(active(), NOV)?.atRisk).toBe(false);
  });

  it("labels a projection based on history as the usual month", () => {
    expect(forecastView(active({ projectionBasis: "usual-month" }), NOV)?.basis).toBe(
      "usual-month",
    );
  });

  it("labels a projection based on this month's pace as a forecast", () => {
    expect(forecastView(active(), NOV)?.basis).toBe("this-month-pace");
  });
});

describe("forecastPoint", () => {
  const view = forecastView(active(), NOV)!;

  it("reads a past day from the actual series", () => {
    expect(forecastPoint(view, 2)).toEqual({ day: 2, amount: 450, kind: "actual" });
  });

  it("reads today from the actual series", () => {
    expect(forecastPoint(view, 4)).toEqual({ day: 4, amount: 900, kind: "actual" });
  });

  it("reads a later day from the projected series", () => {
    expect(forecastPoint(view, 5)).toEqual({ day: 5, amount: 1070, kind: "projected" });
  });

  it("reads the month's last day as where the projection lands", () => {
    expect(forecastPoint(view, 30)).toEqual({ day: 30, amount: 5320, kind: "projected" });
  });
});

describe("scrubDay", () => {
  const view = forecastView(active(), NOV)!;
  const press = (
    key: string,
    mods: Partial<Record<"altKey" | "ctrlKey" | "metaKey" | "shiftKey", boolean>> = {},
  ) => ({
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods,
  });

  it("moves to a later day on the left arrow, the way time runs in RTL", () => {
    expect(scrubDay(view, 10, press("ArrowLeft"))).toBe(11);
  });

  it("moves to an earlier day on the right arrow", () => {
    expect(scrubDay(view, 10, press("ArrowRight"))).toBe(9);
  });

  it("moves later on up and earlier on down", () => {
    expect([scrubDay(view, 10, press("ArrowUp")), scrubDay(view, 10, press("ArrowDown"))]).toEqual([
      11, 9,
    ]);
  });

  it("jumps a week on page up and page down", () => {
    expect([scrubDay(view, 10, press("PageUp")), scrubDay(view, 10, press("PageDown"))]).toEqual([
      17, 3,
    ]);
  });

  it("jumps to the month's first and last day on home and end", () => {
    expect([scrubDay(view, 10, press("Home")), scrubDay(view, 10, press("End"))]).toEqual([1, 30]);
  });

  it("stops at the month's edges", () => {
    expect([scrubDay(view, 30, press("ArrowLeft")), scrubDay(view, 2, press("PageDown"))]).toEqual([
      30, 1,
    ]);
  });

  it("ignores other keys", () => {
    expect(scrubDay(view, 10, press("Enter"))).toBeNull();
  });

  it("leaves modified keys to the browser", () => {
    expect([
      scrubDay(view, 10, press("ArrowLeft", { altKey: true })),
      scrubDay(view, 10, press("Home", { ctrlKey: true })),
      scrubDay(view, 10, press("ArrowRight", { shiftKey: true })),
      scrubDay(view, 10, press("End", { metaKey: true })),
    ]).toEqual([null, null, null, null]);
  });
});

describe("forecastGeometry", () => {
  const view = forecastView(active(), NOV)!;
  const g = forecastGeometry(view, { width: 290, height: 120, top: 10, bottom: 4 });

  it("puts day 1 at the right edge and the month's last day at the left", () => {
    expect([g.x(1), g.x(30)]).toEqual([290, 0]);
  });

  it("rests zero spend on the plot's floor", () => {
    expect(g.y(0)).toBe(116);
  });

  it("keeps the target and the highest point inside the plot", () => {
    expect(g.y(6000)).toBeGreaterThanOrEqual(10);
    expect(g.y(6000)).toBeLessThan(116);
  });

  it("makes room for a projection that lands over the target", () => {
    const over = forecastGeometry(forecastView(active({ target: 3000 }), NOV)!, {
      width: 290,
      height: 120,
      top: 10,
      bottom: 4,
    });
    expect(over.y(5320)).toBeGreaterThanOrEqual(10);
    expect(over.y(3000)).toBeGreaterThan(over.y(5320));
  });

  it("draws the actual line from day 1 to today", () => {
    expect(g.actualPath).toBe("M290,112.8 L280,108.8 L270,104.8 L260,101.5");
  });

  it("starts the projected path where the actual line ends", () => {
    expect(g.projectedPath.startsWith("M260,101.5 L250,")).toBe(true);
  });

  it("draws day 1's lone point as a dot rather than an empty path", () => {
    const day1 = forecastView(
      active({
        projection: {
          total: 3100,
          actual: [200],
          projected: Array.from({ length: 30 }, (_, i) => 200 + i * 100),
        },
      }),
      NOV,
    )!;
    const g1 = forecastGeometry(day1, { width: 290, height: 120, top: 10, bottom: 4 });
    expect(g1.actualPath).toBe("M290,112.8 L290,112.8");
  });
});

describe("dayAtOffset", () => {
  const view = forecastView(active(), NOV)!;

  it("reads the right edge as day 1 and the left edge as the last day", () => {
    expect([dayAtOffset(view, 0, 290), dayAtOffset(view, 290, 290)]).toEqual([1, 30]);
  });

  it("snaps to the nearest day", () => {
    expect(dayAtOffset(view, 104, 290)).toBe(11);
  });

  it("clamps a pointer dragged past either edge", () => {
    expect([dayAtOffset(view, -40, 290), dayAtOffset(view, 400, 290)]).toEqual([1, 30]);
  });

  it("reads today on a plot that has no width yet", () => {
    expect(dayAtOffset(view, 0, 0)).toBe(4);
  });
});

describe("axisTicks", () => {
  const on = (today: number, days = 30) => {
    const actual = Array.from({ length: today }, (_, i) => 100 * (i + 1));
    const projected = Array.from({ length: days + 1 - today }, (_, i) => 100 * (today + i));
    return axisTicks(
      forecastView(
        active({ projection: { total: projected[projected.length - 1], actual, projected } }),
        NOV,
      )!,
    );
  };
  const ends = (days = 30) => [
    { at: 1, label: 1, align: "right" },
    { at: days, label: days, align: "left" },
  ];
  const weeks = [
    { at: 8, label: 8, align: "center" },
    { at: 15, label: 15, align: "center" },
    { at: 22, label: 22, align: "center" },
  ];

  it("labels both ends, the week marks and today mid-month", () => {
    expect(on(12)).toEqual([...ends(), ...weeks, { at: 12, label: "today", align: "center" }]);
  });

  it("drops a week mark that would crowd today", () => {
    expect(on(14).map((t) => t.label)).toEqual([1, 30, 8, 22, "today"]);
  });

  it("names day 1 today when the month has just begun", () => {
    expect(on(1)).toEqual([{ at: 1, label: "today", align: "right" }, ends()[1], ...weeks]);
  });

  it("aligns today near day 1 inward from its own day, keeping the end label when there is room", () => {
    expect(on(3)).toEqual([...ends(), ...weeks, { at: 3, label: "today", align: "right" }]);
  });

  it("gives up day 1's label to today on day 2, where both don't fit", () => {
    expect(on(2)).toEqual([ends()[1], ...weeks, { at: 2, label: "today", align: "right" }]);
  });

  it("aligns today near the last day inward from its own day", () => {
    expect(on(28)).toEqual([...ends(), ...weeks, { at: 28, label: "today", align: "left" }]);
  });

  it("gives up the last day's label to today on the day before it", () => {
    expect(on(29)).toEqual([ends()[0], ...weeks, { at: 29, label: "today", align: "left" }]);
  });

  it("names the last day today on the month's last day", () => {
    expect(on(30)).toEqual([ends()[0], { at: 30, label: "today", align: "left" }, ...weeks]);
  });

  it("follows a 28-day month's length", () => {
    expect(on(26, 28)).toEqual([...ends(28), ...weeks, { at: 26, label: "today", align: "left" }]);
  });

  it("follows a 31-day month's length", () => {
    expect(on(12, 31)).toEqual([
      ...ends(31),
      ...weeks,
      { at: 12, label: "today", align: "center" },
    ]);
  });
});

describe("thinHistoryNeed", () => {
  it("asks for one full month in words", () => {
    expect(thinHistoryNeed(1)).toBe("חודש מלא אחד");
  });

  it("counts several full months", () => {
    expect(thinHistoryNeed(3)).toBe("3 חודשים מלאים");
  });
});
