/**
 * Pure geometry for the reports trend chart. Node-testable (no DOM).
 *
 * Time runs right to left: the oldest month sits at the inline start of the
 * RTL page (the right edge) and the newest at the left, the same direction
 * every time chart in the app reads (spec #312 story 17). The y-axis ticks sit
 * at the right edge, beside the oldest month, outside the plot.
 */

export type TrendsChartPoint = { income: number; expenses: number; netSavings: number };

export type TrendsChartFrame = {
  width: number;
  height: number;
  /** Space reserved at the right edge for the y-axis tick labels. */
  axisGutter: number;
  /** Space kept clear at the left edge. */
  endPad: number;
  plotTop: number;
  plotBottom: number;
};

export type TrendsChartLayout = {
  /** Centre x of month `i` (0 = oldest). */
  xOf: (i: number) => number;
  yOf: (v: number) => number;
  /** Horizontal room each month owns: the hover/focus hit band. */
  slot: number;
  barWidth: number;
  zeroY: number;
  ticks: number[];
  plotLeft: number;
  plotRight: number;
};

const NICE_STEPS = [1, 2, 2.5, 5, 10];

/** Round tick values spanning [min, max] (zero always included), about `target` intervals. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (hi - lo === 0) return [0];
  const magnitude = 10 ** Math.floor(Math.log10((hi - lo) / target));
  // The finest round step that needs at most one interval more than asked:
  // straddling zero can cost an extra interval, a coarser step wastes more.
  const intervals = (step: number) => Math.ceil(hi / step) - Math.floor(lo / step);
  const step =
    NICE_STEPS.map((s) => s * magnitude).find((s) => intervals(s) <= target + 1) ?? 10 * magnitude;
  const first = Math.floor(lo / step) * step;
  const last = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= last + step / 2; v += step) ticks.push(Math.round(v * 100) / 100 || 0);
  return ticks;
}

export function layoutTrendsChart(
  points: TrendsChartPoint[],
  frame: TrendsChartFrame,
): TrendsChartLayout {
  const plotLeft = frame.endPad;
  const plotRight = Math.max(plotLeft, frame.width - frame.axisGutter);
  const n = points.length;
  const slot = n > 0 ? (plotRight - plotLeft) / n : 0;
  // Thin marks: never fill the slot, never wider than 16px (dataviz mark spec).
  const barWidth = Math.max(2, Math.min(16, slot * 0.5));

  const values = points.flatMap((p) => [p.income, p.expenses, p.netSavings]);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const domainMin = ticks[0];
  const domainMax = ticks[ticks.length - 1];
  const span = domainMax - domainMin || 1;
  const plotH = frame.plotBottom - frame.plotTop;
  const yOf = (v: number) => frame.plotTop + ((domainMax - v) / span) * plotH;

  return {
    xOf: (i: number) => plotRight - slot * (i + 0.5),
    yOf,
    slot,
    barWidth,
    zeroY: yOf(0),
    ticks,
    plotLeft,
    plotRight,
  };
}
