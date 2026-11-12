import type { HomeMonth } from "./month";
import type { ActiveOutlook } from "./outlook-view";

/**
 * The month forecast chart's reading of an active outlook (#318). It picks
 * and indexes the series `monthOutlook` returned; it never computes money.
 */
export type ForecastView = {
  month: HomeMonth;
  /** Day of the month the outlook stands on: the actual series' last day. */
  today: number;
  daysInMonth: number;
  target: number;
  /** Cumulative net spend, index 0 = day 1, through today. */
  actual: readonly number[];
  /** Cumulative projected spend, index 0 = today, through the last day. */
  projected: readonly number[];
  /** Where the month lands. */
  total: number;
  basis: NonNullable<ActiveOutlook["projectionBasis"]>;
  /** The day the projection first exceeds the target (`crossingDate`), or null. */
  crossingDay: number | null;
  /** Heading over the target: the projection crosses it, or the month is already over. */
  atRisk: boolean;
};

export function forecastView(o: ActiveOutlook, month: HomeMonth): ForecastView | null {
  const p = o.projection;
  if (p === null) return null;
  const today = p.actual.length;
  return {
    month,
    today,
    daysInMonth: today + p.projected.length - 1,
    target: o.target,
    actual: p.actual,
    projected: p.projected,
    total: p.total,
    basis: o.projectionBasis ?? "this-month-pace",
    crossingDay: o.crossingDate === null ? null : Number(o.crossingDate.slice(8, 10)),
    atRisk: o.crossingDate !== null || o.overBy !== null,
  };
}

export type ForecastPoint = { day: number; amount: number; kind: "actual" | "projected" };

/**
 * Cumulative spend on `day`. Today reads the actual series: on the month's
 * last day the projection's first point already holds the late charges it
 * lands today, which haven't been spent.
 */
export function forecastPoint(v: ForecastView, day: number): ForecastPoint {
  return day <= v.today
    ? { day, amount: v.actual[day - 1], kind: "actual" }
    : { day, amount: v.projected[day - v.today], kind: "projected" };
}

const KEY_STEP: Record<string, number> = {
  // The time axis runs right-to-left (newest on the left), so left is later.
  ArrowLeft: 1,
  ArrowRight: -1,
  ArrowUp: 1,
  ArrowDown: -1,
  PageUp: 7,
  PageDown: -7,
};

export type KeyPress = Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">;

/**
 * The day a key moves the scrub to from `day`, or null for a key that doesn't
 * scrub. A modified key is the browser's (Alt+Arrow is Back), never a scrub.
 */
export function scrubDay(v: ForecastView, day: number, press: KeyPress): number | null {
  if (press.altKey || press.ctrlKey || press.metaKey || press.shiftKey) return null;
  const { key } = press;
  if (key === "Home") return 1;
  if (key === "End") return v.daysInMonth;
  const step = KEY_STEP[key];
  if (step === undefined) return null;
  return Math.min(v.daysInMonth, Math.max(1, day + step));
}

/** Headroom above the highest of the target and the series, so neither touches the top. */
const HEADROOM = 1.1;

export type PlotBox = { width: number; height: number; top: number; bottom: number };

export type ForecastGeometry = {
  x: (day: number) => number;
  y: (amount: number) => number;
  actualPath: string;
  projectedPath: string;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Pixel geometry for a plot `width` × `height`. Day 1 sits at the right edge:
 * the time axis reads right-to-left like every time chart in the app.
 */
export function forecastGeometry(v: ForecastView, box: PlotBox): ForecastGeometry {
  const { width, height, top, bottom } = box;
  const series = [...v.actual, ...v.projected];
  const max = Math.max(v.target, ...series, 1) * HEADROOM;
  const min = Math.min(0, ...series);
  const plot = height - top - bottom;
  const x = (day: number) => round1(width - ((day - 1) / (v.daysInMonth - 1)) * width);
  const y = (amount: number) => round1(top + ((max - amount) / (max - min)) * plot);
  // A lone point (day 1's actual, the last day's projection) is drawn as a
  // zero-length segment: with round caps SVG paints it as a dot, where a bare
  // moveto paints nothing.
  const path = (amounts: readonly number[], firstDay: number) => {
    const points = amounts.map((a, i) => `${x(firstDay + i)},${y(a)}`);
    if (points.length === 1) points.push(points[0]);
    return points.map((p, i) => `${i === 0 ? "M" : "L"}${p}`).join(" ");
  };
  return {
    x,
    y,
    actualPath: path(v.actual, 1),
    projectedPath: path(v.projected, v.today),
  };
}

const WEEK_MARKS = [8, 15, 22];
/** A label this close to today gives way to today's own label. */
const TICK_CLEARANCE = 3;

/**
 * An axis label at `at`'s x. "right"/"left" are physical: the plot's ends,
 * where the label sits flush inside the edge instead of centred over it.
 */
export type AxisTick = {
  at: number;
  label: number | "today";
  align: "center" | "right" | "left";
};

/**
 * Both ends of the month, the week marks and today. Today near an end takes
 * that end's place flush with the edge, so its label never spills past the plot.
 */
export function axisTicks(v: ForecastView): AxisTick[] {
  const { today, daysInMonth } = v;
  const nearFirst = today - 1 < TICK_CLEARANCE;
  const nearLast = !nearFirst && daysInMonth - today < TICK_CLEARANCE;
  const ticks: AxisTick[] = [
    { at: 1, label: nearFirst ? "today" : 1, align: "right" },
    ...WEEK_MARKS.filter((d) => Math.abs(d - today) >= TICK_CLEARANCE).map(
      (d): AxisTick => ({ at: d, label: d, align: "center" }),
    ),
    { at: daysInMonth, label: nearLast ? "today" : daysInMonth, align: "left" },
  ];
  if (!nearFirst && !nearLast) ticks.push({ at: today, label: "today", align: "center" });
  return ticks;
}

/** How much history a projection needs, in words (`THIN_HISTORY_MIN_FULL_MONTHS`). */
export function thinHistoryNeed(minFullMonths: number): string {
  return minFullMonths === 1 ? "חודש מלא אחד" : `${minFullMonths} חודשים מלאים`;
}

/** The day under a pointer `offsetFromRight` pixels from the plot's right edge. */
export function dayAtOffset(v: ForecastView, offsetFromRight: number, width: number): number {
  if (width <= 0) return v.today;
  const fraction = Math.min(1, Math.max(0, offsetFromRight / width));
  return Math.round(fraction * (v.daysInMonth - 1)) + 1;
}
