"use client";

import * as React from "react";
import { Amount } from "@/components/ui/amount";
import { cn } from "@/lib/utils";
import type { TrendsMonthPoint } from "@/lib/reports/trends";
import { HEBREW_MONTHS, HEBREW_MONTHS_SHORT, formatAxisTick } from "./format";
import { layoutTrendsChart } from "./trends-chart-layout";

// Fixed pixel height; the width is MEASURED so the SVG coordinate space is 1:1
// with rendered pixels at any screen size (#170: a constant viewBox letterboxes
// on wide screens, preserveAspectRatio="none" stretches strokes into ellipses).
const HEIGHT = 236;
const FRAME = { height: HEIGHT, axisGutter: 44, endPad: 4, plotTop: 10, plotBottom: 192 };
const MIN_LABEL_SPACING = 30;

/** Bar with a 4px rounded data end and a square baseline (dataviz mark spec). */
function barPath(x: number, w: number, baseY: number, valueY: number): string {
  const h = Math.abs(valueY - baseY);
  if (h < 0.5) return `M${x},${baseY - 0.5}h${w}v1h${-w}Z`;
  const r = Math.min(4, w / 2, h);
  const up = valueY < baseY;
  const end = valueY;
  const s = up ? 1 : -1; // direction from the data end back toward the baseline
  return [
    `M${x},${baseY}`,
    `V${end + s * r}`,
    `Q${x},${end} ${x + r},${end}`,
    `H${x + w - r}`,
    `Q${x + w},${end} ${x + w},${end + s * r}`,
    `V${baseY}`,
    "Z",
  ].join(" ");
}

function useMeasuredWidth<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Income and expenses as lines, net savings as bars around zero, one ₪ axis.
 * Time runs right to left (oldest at the right edge). Point, tap, or focus the
 * chart and use the arrow keys to read a month; every value is also in the
 * table view beside it, so the tooltip never gates a figure.
 */
export function TrendsChart({ points }: { points: TrendsMonthPoint[] }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = React.useState<number | null>(null);
  const n = points.length;
  const layout = React.useMemo(
    () => layoutTrendsChart(points, { ...FRAME, width }),
    [points, width],
  );
  // The last point is always the current calendar month (the range ends at
  // today's month): still in progress, so it is drawn faded and named partial.
  const partialIndex = n - 1;

  const labelStep = Math.max(1, Math.ceil(MIN_LABEL_SPACING / Math.max(1, layout.slot)));
  const showLabel = (i: number) => (n - 1 - i) % labelStep === 0;
  // The year rides under the oldest labelled month and under each January.
  const firstLabelled = (n - 1) % labelStep;

  const linePath = (pick: (p: TrendsMonthPoint) => number) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${layout.xOf(i)},${layout.yOf(pick(p))}`).join(" ");

  function onKeyDown(e: React.KeyboardEvent) {
    if (n === 0) return;
    const current = active ?? n - 1;
    // Newer months lie to the left in this RTL chart, so ArrowLeft moves forward in time.
    const next =
      e.key === "ArrowLeft"
        ? Math.min(n - 1, current + 1)
        : e.key === "ArrowRight"
          ? Math.max(0, current - 1)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
  }

  const activePoint = active !== null ? points[active] : null;
  const tooltipWidth = 176;
  const tooltipLeft =
    active !== null
      ? Math.min(
          Math.max(0, layout.xOf(active) - tooltipWidth / 2),
          Math.max(0, width - tooltipWidth),
        )
      : 0;

  return (
    <div className="relative">
      <div
        ref={ref}
        role="group"
        tabIndex={0}
        aria-label="הכנסות, הוצאות וחיסכון נטו לפי חודש. חיצים ימינה ושמאלה לקריאת חודש."
        aria-describedby="trends-chart-readout"
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a ?? n - 1)}
        onBlur={() => setActive(null)}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setActive(null);
        }}
        className="focus-visible:ring-ring/50 w-full touch-pan-y rounded-lg outline-none focus-visible:ring-3"
        style={{ height: HEIGHT }}
      >
        {width > 0 && (
          <svg width={width} height={HEIGHT} aria-hidden style={{ direction: "ltr" }}>
            {layout.ticks.map((t) => (
              <g key={t}>
                <line
                  x1={layout.plotLeft}
                  x2={layout.plotRight}
                  y1={layout.yOf(t)}
                  y2={layout.yOf(t)}
                  stroke={t === 0 ? "var(--muted-foreground)" : "var(--border)"}
                  strokeOpacity={t === 0 ? 0.5 : 1}
                  strokeWidth={1}
                />
                <text
                  x={layout.plotRight + 6}
                  y={layout.yOf(t)}
                  dominantBaseline="middle"
                  fill="var(--muted-foreground)"
                  fontSize={11}
                  className="tabular-nums"
                >
                  {formatAxisTick(t)}
                </text>
              </g>
            ))}
            <text
              x={layout.plotRight + 6}
              y={FRAME.plotBottom + 18}
              fill="var(--muted-foreground)"
              fontSize={11}
            >
              ₪
            </text>

            {active !== null && (
              <rect
                x={layout.xOf(active) - layout.slot / 2}
                y={FRAME.plotTop}
                width={layout.slot}
                height={FRAME.plotBottom - FRAME.plotTop}
                fill="var(--muted)"
                rx={4}
              />
            )}

            {points.map((p, i) => (
              <path
                key={`bar-${i}`}
                d={barPath(
                  layout.xOf(i) - layout.barWidth / 2,
                  layout.barWidth,
                  layout.zeroY,
                  layout.yOf(p.netSavings),
                )}
                fill={p.netSavings >= 0 ? "var(--pos)" : "var(--neg)"}
                opacity={i === partialIndex ? 0.4 : 0.85}
              />
            ))}

            <path
              d={linePath((p) => p.income)}
              fill="none"
              stroke="var(--chart-1)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={linePath((p) => p.expenses)}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {activePoint && active !== null && (
              <g>
                <circle
                  cx={layout.xOf(active)}
                  cy={layout.yOf(activePoint.income)}
                  r={4}
                  fill="var(--chart-1)"
                  stroke="var(--card)"
                  strokeWidth={2}
                />
                <circle
                  cx={layout.xOf(active)}
                  cy={layout.yOf(activePoint.expenses)}
                  r={4}
                  fill="var(--muted-foreground)"
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              </g>
            )}

            {points.map((p, i) =>
              showLabel(i) ? (
                <text
                  key={`m-${i}`}
                  x={layout.xOf(i)}
                  y={FRAME.plotBottom + 18}
                  textAnchor="middle"
                  fill={i === active ? "var(--foreground)" : "var(--muted-foreground)"}
                  fontSize={11}
                  fontWeight={i === active ? 600 : 400}
                >
                  {HEBREW_MONTHS_SHORT[p.month - 1]}
                </text>
              ) : null,
            )}
            {points.map((p, i) =>
              showLabel(i) && (i === firstLabelled || p.month === 1) ? (
                <text
                  key={`y-${i}`}
                  x={layout.xOf(i)}
                  y={FRAME.plotBottom + 34}
                  textAnchor="middle"
                  fill="var(--muted-foreground)"
                  fontSize={10}
                  className="tabular-nums"
                >
                  {p.year}
                </text>
              ) : null,
            )}

            {points.map((_, i) => (
              <rect
                key={`hit-${i}`}
                x={layout.xOf(i) - layout.slot / 2}
                y={0}
                width={layout.slot}
                height={HEIGHT}
                fill="transparent"
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
              />
            ))}
          </svg>
        )}
      </div>

      <div
        id="trends-chart-readout"
        aria-live="polite"
        className={cn(
          "bg-popover text-popover-foreground pointer-events-none absolute top-0 z-10 rounded-lg border p-2.5 shadow-[var(--card-shadow)]",
          activePoint ? "block" : "sr-only",
        )}
        style={activePoint ? { left: tooltipLeft, width: tooltipWidth } : undefined}
      >
        {activePoint && (
          <>
            <p className="text-caption mb-1.5 font-semibold">
              {HEBREW_MONTHS[activePoint.month - 1]} {activePoint.year}
              {active === partialIndex && (
                <span className="text-muted-foreground font-normal"> · חודש חלקי</span>
              )}
            </p>
            <dl className="text-caption grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">הכנסות</dt>
              <dd className="text-end">
                <Amount amount={activePoint.income} colorize={false} fractionDigits={0} />
              </dd>
              <dt className="text-muted-foreground">הוצאות</dt>
              <dd className="text-end">
                <Amount amount={activePoint.expenses} colorize={false} fractionDigits={0} />
              </dd>
              <dt className="text-muted-foreground">חיסכון נטו</dt>
              <dd className="text-end font-semibold">
                <Amount amount={Math.round(activePoint.netSavings) || 0} fractionDigits={0} />
              </dd>
            </dl>
          </>
        )}
      </div>
    </div>
  );
}

/** Legend: one entry per series, the mark beside text that stays in text colour. */
export function TrendsLegend() {
  return (
    <ul className="text-caption text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="inline-flex h-3 w-2.5 overflow-hidden rounded-sm">
          <span className="bg-pos w-1/2" />
          <span className="bg-neg w-1/2" />
        </span>
        חיסכון נטו (מעל האפס חיובי, מתחת שלילי)
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="border-chart-1 inline-block w-4 border-t-2" />
        הכנסות
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="border-muted-foreground inline-block w-4 border-t-2 border-dashed"
        />
        הוצאות
      </li>
    </ul>
  );
}
