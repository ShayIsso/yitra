import { describe, it, expect } from "vitest";
import { layoutTrendsChart, niceTicks } from "@/components/reports/trends-chart-layout";

const FRAME = { width: 400, height: 240, axisGutter: 40, endPad: 8, plotTop: 10, plotBottom: 200 };

const point = (income: number, expenses: number) => ({
  income,
  expenses,
  netSavings: income - expenses,
});

describe("layoutTrendsChart", () => {
  it("runs time right to left: the oldest month sits nearest the right edge", () => {
    const layout = layoutTrendsChart([point(10, 5), point(10, 5), point(10, 5)], FRAME);
    expect(layout.xOf(0)).toBeGreaterThan(layout.xOf(1));
    expect(layout.xOf(1)).toBeGreaterThan(layout.xOf(2));
  });

  it("keeps every month inside the plot, between the end pad and the axis gutter", () => {
    const layout = layoutTrendsChart(
      Array.from({ length: 24 }, () => point(1, 1)),
      FRAME,
    );
    expect(layout.xOf(0) + layout.slot / 2).toBeCloseTo(FRAME.width - FRAME.axisGutter);
    expect(layout.xOf(23) - layout.slot / 2).toBeCloseTo(FRAME.endPad);
  });

  it("puts a deficit month's net below the zero line and the domain on round ticks", () => {
    const layout = layoutTrendsChart([point(8000, 9500), point(9000, 6000)], FRAME);
    expect(layout.yOf(-1500)).toBeGreaterThan(layout.zeroY);
    expect(layout.ticks).toContain(0);
    expect(layout.yOf(layout.ticks[0])).toBeCloseTo(FRAME.plotBottom);
    expect(layout.yOf(layout.ticks[layout.ticks.length - 1])).toBeCloseTo(FRAME.plotTop);
  });

  it("caps bar width so marks never fill their slot", () => {
    const layout = layoutTrendsChart([point(1, 1), point(1, 1)], FRAME);
    expect(layout.barWidth).toBeLessThanOrEqual(16);
    expect(layout.barWidth).toBeLessThan(layout.slot);
  });
});

describe("niceTicks", () => {
  it("spans the range on round steps including zero", () => {
    expect(niceTicks(0, 9500)).toEqual([0, 2000, 4000, 6000, 8000, 10000]);
    expect(niceTicks(-1500, 9000)).toEqual([-2500, 0, 2500, 5000, 7500, 10000]);
  });

  it("collapses an all-zero range to a single zero tick", () => {
    expect(niceTicks(0, 0)).toEqual([0]);
  });
});
