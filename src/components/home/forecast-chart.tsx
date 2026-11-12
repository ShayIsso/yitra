"use client";

import * as React from "react";
import { ChartLineUpIcon, WarningCircleIcon } from "@/components/icons";
import { Amount, formatAmount } from "@/components/ui/amount";
import { useMeasuredSize } from "@/components/use-measured-size";
import { THIN_HISTORY_MIN_FULL_MONTHS } from "@/lib/budgets/thin-history";
import { cn } from "@/lib/utils";
import {
  axisTicks,
  dayAtOffset,
  forecastGeometry,
  forecastPoint,
  forecastView,
  scrubDay,
  thinHistoryNeed,
  type AxisTick,
  type ForecastPoint,
  type ForecastView,
} from "./forecast-view";
import { monthName, type HomeMonth } from "./month";
import type { ActiveOutlook, OutlookOf } from "./outlook-view";

/*
 * The month forecast (#318): actual cumulative spend, the target and the
 * projected path, from the outlook the hero already loaded. Three marks and
 * nothing else; every figure is a field `monthOutlook` returned.
 */

const PLOT_TOP = 8;
const PLOT_BOTTOM = 6;

/** Early in the month the projection is mostly history: it is named so, not a prediction. */
const BASIS_COPY = {
  "this-month-pace": { mark: "צפי", crossing: "בקצב הזה", end: "צפי לסוף החודש" },
  "usual-month": {
    mark: "החודש הרגיל שלך",
    crossing: "לפי החודש הרגיל שלך,",
    end: "סוף החודש, לפי החודש הרגיל שלך",
  },
} as const;

function dayLabel(day: number, view: ForecastView): string {
  return `${day} ב${monthName(view.month)}`;
}

function pointKind(point: ForecastPoint, view: ForecastView): string {
  return point.kind === "actual" ? "בפועל" : BASIS_COPY[view.basis].mark;
}

/**
 * The forecast section for an outlook that can have one: active, or thin
 * history (no target yet), which, like an active month without a projection,
 * gets the plain explanation instead of a chart.
 */
export function ForecastChart({
  outlook,
  month,
  busy = false,
}: {
  outlook: ActiveOutlook | OutlookOf<"thin-history">;
  month: HomeMonth;
  /**
   * The next month is loading: this one stays, dimmed and inert, so it can't
   * be scrubbed or read out as if it were the month asked for.
   */
  busy?: boolean;
}) {
  const titleId = React.useId();
  const view = React.useMemo(
    () => (outlook.state === "active" ? forecastView(outlook, month) : null),
    [outlook, month],
  );
  return (
    <section
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-4 rounded-xl border border-[color:var(--card-border)] p-5 shadow-[var(--card-shadow)] transition-opacity duration-150 sm:p-6",
        busy && "opacity-60",
      )}
    >
      {view === null ? (
        <ThinHistory titleId={titleId} hasTarget={outlook.state === "active"} />
      ) : (
        <Forecast view={view} titleId={titleId} busy={busy} />
      )}
    </section>
  );
}

function Title({ id }: { id: string }) {
  return (
    <h2 id={id} className="text-lead font-semibold">
      לאן החודש הולך
    </h2>
  );
}

function ThinHistory({ titleId, hasTarget }: { titleId: string; hasTarget: boolean }) {
  return (
    <>
      <Title id={titleId} />
      <div className="flex items-start gap-3">
        <span className="bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-full">
          <ChartLineUpIcon weight="duotone" className="size-5" />
        </span>
        <p className="text-muted-foreground text-body max-w-prose text-pretty">
          {`כדי להעריך לאן החודש הולך צריך לפחות ${thinHistoryNeed(THIN_HISTORY_MIN_FULL_MONTHS)} של היסטוריה מכל החשבונות המחוברים. עד אז מוצג רק מה שכבר יצא${hasTarget ? " וכמה נשאר" : ""}.`}
        </p>
      </div>
    </>
  );
}

function Forecast({ view, titleId, busy }: { view: ForecastView; titleId: string; busy: boolean }) {
  const [scrub, setScrubbed] = React.useState<number | null>(null);
  const scrubbed = busy ? null : scrub;
  const readoutId = React.useId();
  const point = forecastPoint(view, scrubbed ?? view.today);
  const copy = BASIS_COPY[view.basis];

  return (
    <>
      <div className="flex flex-col gap-x-4 gap-y-2 sm:flex-row sm:items-center sm:justify-between">
        <Title id={titleId} />
        <Legend view={view} />
      </div>

      {view.crossingDay !== null && (
        <p className="text-body flex items-start gap-2 text-pretty">
          <WarningCircleIcon weight="fill" className="text-attention-text mt-0.5 size-4 shrink-0" />
          <span>
            {copy.crossing} היעד ייחצה ב־{dayLabel(view.crossingDay, view)}
          </span>
        </p>
      )}

      <div id={readoutId} className="flex flex-col">
        <p className="text-muted-foreground text-caption">
          {scrubbed === null ? copy.end : `${dayLabel(scrubbed, view)} · ${pointKind(point, view)}`}
        </p>
        <p className="text-lead font-semibold">
          {scrubbed === null ? (
            <>
              ≈ <Amount amount={view.total} colorize={false} fractionDigits={0} />
            </>
          ) : (
            <>
              <Amount amount={point.amount} colorize={false} fractionDigits={0} />
              <span className="text-muted-foreground text-body font-normal"> מצטבר</span>
            </>
          )}
        </p>
      </div>

      <Plot
        view={view}
        busy={busy}
        scrubbed={scrubbed}
        point={point}
        readoutId={readoutId}
        onScrub={setScrubbed}
      />
    </>
  );
}

function Plot({
  view,
  busy,
  scrubbed,
  point,
  readoutId,
  onScrub,
}: {
  view: ForecastView;
  busy: boolean;
  scrubbed: number | null;
  point: ForecastPoint;
  readoutId: string;
  onScrub: React.Dispatch<React.SetStateAction<number | null>>;
}) {
  const [ref, { width, height }] = useMeasuredSize<HTMLDivElement>();
  const geometry = React.useMemo(
    () =>
      width > 0 && height > 0
        ? forecastGeometry(view, { width, height, top: PLOT_TOP, bottom: PLOT_BOTTOM })
        : null,
    [view, width, height],
  );

  function dayAt(e: React.PointerEvent<HTMLDivElement>): number {
    const rect = e.currentTarget.getBoundingClientRect();
    return dayAtOffset(view, rect.right - e.clientX, rect.width);
  }

  // Pointer scrubbing never takes focus (see onMouseDown), so focus means the
  // keyboard: a released pointer returns a focused slider to today, the value
  // it announces, and otherwise clears the marker.
  function release(el: HTMLElement) {
    onScrub(document.activeElement === el ? view.today : null);
  }

  return (
    <div inert={busy} className="flex flex-col gap-1.5">
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="הוצאה מצטברת לפי יום בחודש"
        aria-describedby={readoutId}
        aria-orientation="horizontal"
        aria-valuemin={1}
        aria-valuemax={view.daysInMonth}
        aria-valuenow={point.day}
        aria-valuetext={`${dayLabel(point.day, view)}: ${formatAmount(point.amount, "ILS", 0)}, ${pointKind(point, view)}`}
        onKeyDown={(e) => {
          const next = scrubDay(view, scrubbed ?? view.today, e);
          if (next === null) return;
          e.preventDefault();
          onScrub(next);
        }}
        // Focus shows the day the slider reports, so the readout and the
        // announced value never disagree.
        onFocus={() => onScrub((day) => day ?? view.today)}
        onBlur={() => onScrub(null)}
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          // Keep a touch drag on the plot even when it strays off it.
          if (e.pointerType !== "mouse") e.currentTarget.setPointerCapture(e.pointerId);
          onScrub(dayAt(e));
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" || e.buttons > 0) onScrub(dayAt(e));
        }}
        onPointerUp={(e) => {
          if (e.pointerType !== "mouse") release(e.currentTarget);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") release(e.currentTarget);
        }}
        onPointerCancel={(e) => release(e.currentTarget)}
        className="focus-visible:ring-ring/50 relative h-28 w-full cursor-crosshair touch-pan-y rounded-lg outline-none select-none focus-visible:ring-3 sm:h-36"
      >
        {geometry && (
          <svg
            width={width}
            height={height}
            aria-hidden="true"
            className="absolute inset-0 overflow-visible"
          >
            <line
              x1={0}
              x2={width}
              y1={geometry.y(view.target)}
              y2={geometry.y(view.target)}
              stroke="var(--muted-foreground)"
              strokeWidth={1.5}
              strokeDasharray="6 5"
            />
            <path
              d={geometry.projectedPath}
              fill="none"
              stroke={view.atRisk ? "var(--attention-text)" : "var(--primary)"}
              strokeWidth={2.5}
              strokeDasharray="0.5 6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Actual last: on day 1 its lone dot sits where the projection starts. */}
            <path
              d={geometry.actualPath}
              fill="none"
              stroke="var(--foreground)"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {scrubbed !== null && (
              <g>
                <line
                  x1={geometry.x(scrubbed)}
                  x2={geometry.x(scrubbed)}
                  y1={0}
                  y2={height}
                  stroke="var(--muted-foreground)"
                  strokeWidth={1}
                />
                <circle
                  cx={geometry.x(scrubbed)}
                  cy={geometry.y(point.amount)}
                  r={5}
                  fill="var(--card)"
                  stroke="var(--foreground)"
                  strokeWidth={2.5}
                />
              </g>
            )}
          </svg>
        )}
      </div>
      {/* Physical `left`, not a logical inset: the ticks follow the SVG's pixel x. */}
      <div
        aria-hidden="true"
        className="text-muted-foreground text-caption relative h-4 tabular-nums"
      >
        {geometry &&
          axisTicks(view).map((t) => (
            <span
              key={t.at}
              className={cn(
                "absolute top-0 whitespace-nowrap",
                TICK_ALIGN[t.align],
                t.label === "today" && "text-foreground font-semibold",
              )}
              style={{ left: geometry.x(t.at) }}
            >
              {t.label === "today" ? "היום" : t.label}
            </span>
          ))}
      </div>
    </div>
  );
}

/** Day 1's x is the plot's right edge, the last day's its left edge. */
const TICK_ALIGN: Record<AxisTick["align"], string> = {
  right: "-translate-x-full",
  center: "-translate-x-1/2",
  left: "",
};

function Swatch({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn("inline-block w-4 border-t-2", className)} />;
}

function Legend({ view }: { view: ForecastView }) {
  return (
    <ul className="text-caption text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
      <li className="flex items-center gap-1.5">
        <Swatch className="border-foreground" />
        בפועל
      </li>
      <li className="flex items-center gap-1.5">
        <Swatch
          className={
            view.atRisk ? "border-attention-text border-dotted" : "border-primary border-dotted"
          }
        />
        {BASIS_COPY[view.basis].mark}
      </li>
      <li className="flex items-center gap-1.5">
        <Swatch className="border-muted-foreground border-dashed" />
        יעד <Amount amount={view.target} colorize={false} fractionDigits={0} />
      </li>
    </ul>
  );
}
