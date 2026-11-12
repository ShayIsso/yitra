import type { MonthChange } from "@/lib/analytics/month-metrics";
import { HEBREW_MONTHS, formatPointsDelta, formatSignedPercent } from "@/components/reports/format";
import type { DeltaView } from "@/components/reports/parts";

/**
 * Presentation for the home trend sections (#320). Client-only callers
 * (hydration rule, CLAUDE.md). Nothing here computes money: changes arrive
 * computed from `/api/home-trends`; these helpers only word and place them,
 * and `DeltaChip` judges them.
 */

const SIGNED_ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  signDisplay: "exceptZero",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const FLAT: DeltaView = { direction: "flat", label: "ללא שינוי" };

/**
 * A month-over-month change: a signed percent, or signed shekels when the
 * server judged a ratio misleading. Intl anchors the sign with a
 * left-to-right mark, so in RTL it sits on the number's left.
 */
export function changeView(change: MonthChange): DeltaView {
  if (Math.round(change.amount) === 0) return FLAT;
  return {
    direction: change.amount > 0 ? "up" : "down",
    label:
      change.percent !== null && Math.round(change.percent) !== 0
        ? formatSignedPercent(change.percent)
        : SIGNED_ILS.format(Math.round(change.amount)),
  };
}

/** The savings rate's move, in percentage points. */
export function rateChangeView(points: number): DeltaView {
  if (Math.round(points) === 0) return FLAT;
  return { direction: points > 0 ? "up" : "down", label: formatPointsDelta(points) };
}

/** A category's change; one with nothing in the comparison window is new, with no baseline to rise from. */
export function categoryChangeView(change: MonthChange & { previous: number }): DeltaView {
  if (change.previous <= 0) return { direction: "flat", label: "חדש" };
  return changeView(change);
}

/** What a change is measured against, in words ("מול …" is the chip's). */
export function comparisonLabel({
  basis,
  previousMonth,
}: {
  basis: "month-to-date" | "whole-month";
  previousMonth: { year: number; month: number };
}): string {
  const name = HEBREW_MONTHS[previousMonth.month - 1];
  return basis === "month-to-date" ? `אותם ימים ב${name}` : name;
}

export type SparkPoint = { x: number; y: number } | null;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Where each of `values` sits in a `width` × `height` box: the oldest at the
 * right edge and the newest at the left, since time charts read right to left
 * (spec #312). A missing value has no point. `pad` keeps the extremes clear
 * of the top and bottom edges.
 */
export function sparklinePoints(
  values: readonly (number | null)[],
  width: number,
  height: number,
  pad = 0,
): SparkPoint[] {
  const present = values.filter((v): v is number => v !== null);
  const min = Math.min(...present);
  const max = Math.max(...present);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((v, i) =>
    v === null
      ? null
      : {
          x: round2(width - i * step),
          y:
            max === min
              ? height / 2
              : round2(height - pad - ((v - min) / (max - min)) * (height - 2 * pad)),
        },
  );
}

/** An SVG path through {@link sparklinePoints}; a missing value breaks the line. */
export function sparklinePath(
  values: readonly (number | null)[],
  width: number,
  height: number,
  pad = 0,
): string {
  let path = "";
  let drawing = false;
  for (const p of sparklinePoints(values, width, height, pad)) {
    if (p === null) {
      drawing = false;
      continue;
    }
    path += `${drawing ? "L" : "M"}${p.x},${p.y}`;
    drawing = true;
  }
  return path;
}

/**
 * Bar lengths for the income-versus-expense chart, each a fraction of the
 * window's largest figure. A negative month figure (a net-refund month) has
 * no bar.
 */
export function chartColumns(
  months: readonly { income: number; expenses: number }[],
): { income: number; expenses: number }[] {
  const max = Math.max(0, ...months.flatMap((m) => [m.income, m.expenses]));
  const scale = (v: number) => (max > 0 ? Math.max(0, v) / max : 0);
  return months.map((m) => ({ income: scale(m.income), expenses: scale(m.expenses) }));
}
