"use client";

import * as React from "react";
import { ChartLineUpIcon } from "@/components/icons";
import { formatILS, HEBREW_MONTHS, HEBREW_MONTHS_SHORT } from "@/components/reports/format";
import { cn } from "@/lib/utils";
import type { HomeTrendPoint } from "@/lib/reports/home-trends";
import { homeHref, isBrowsable, sameMonth, type HomeMonth, type MonthRange } from "../month";
import { Bone } from "../sections/parts";
import { chartColumns } from "./trends-view";

const CHART_CARD =
  "bg-card rounded-xl border border-[color:var(--card-border)] p-4 shadow-[var(--card-shadow)]";
const PLOT = "flex h-48 items-stretch gap-0.5 sm:gap-1";
/** Two fixed lines (legend, then the summary) at every width, so the skeleton matches. */
const HEAD = "mb-3 flex flex-col gap-1";
const LINE = "flex min-h-[1.125rem] items-center";

/** A plain click navigates in place; a modified one (new tab, new window) is the browser's. */
function isPlainClick(e: React.MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function Legend() {
  return (
    <ul className={cn(LINE, "text-caption text-muted-foreground gap-x-4")}>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="bg-chart-1 inline-block h-3 w-1.5 rounded-full" />
        נכנס (מעל הקו)
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="bg-muted-foreground inline-block h-3 w-1.5 rounded-full" />
        יצא (מתחת לקו)
      </li>
    </ul>
  );
}

/**
 * Twelve months of income against expenses (#320): income rises above the
 * axis, expenses hang below it. In the RTL document the first column sits at
 * the right, so the oldest month is at the right edge and the newest at the
 * left (spec #312 story 17). Each month is a link to the home screen for that
 * month; a plain click switches in place through `onSelect`, which keeps the
 * switch instant (no server round trip). Months before the range's floor are
 * not links.
 */
export function YearChart({
  months,
  selected,
  range,
  onSelect,
}: {
  months: HomeTrendPoint[];
  selected: HomeMonth;
  /** Browsable months; its current month is still running, so drawn faded and named partial. */
  range: MonthRange;
  onSelect: (month: HomeMonth) => void;
}) {
  const columns = chartColumns(months);
  const withData = months.filter((m) => m.hasData);
  // A month still running has not ended in anything yet.
  const ended = withData.filter((m) => !sameMonth(m, range.current));
  const positive = ended.filter((m) => m.netSavings > 0).length;

  return (
    <div className={CHART_CARD}>
      <div className={HEAD}>
        <Legend />
        <p className={cn(LINE, "text-caption text-muted-foreground tabular-nums")}>
          {ended.length > 0 && `${positive} מתוך ${ended.length} חודשים נגמרו בפלוס`}
        </p>
      </div>
      {withData.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
          <ChartLineUpIcon weight="duotone" className="text-primary size-8" />
          <p className="text-body text-muted-foreground">עוד אין נתונים לשנה הזו</p>
        </div>
      ) : (
        <ol className={PLOT} aria-label="מעבר לחודש">
          {months.map((m, i) => {
            const month = { year: m.year, month: m.month };
            const isSelected = sameMonth(month, selected);
            const partial = sameMonth(month, range.current);
            const name = `${HEBREW_MONTHS[m.month - 1]} ${m.year}`;
            const body = (
              <>
                <span className="relative flex-1 border-b border-[color:var(--border)]">
                  <span
                    className={cn(
                      "bg-chart-1 absolute bottom-0.5 left-1/2 w-[56%] max-w-4 -translate-x-1/2 rounded-t-sm",
                      partial && "opacity-60",
                    )}
                    style={{ height: `${columns[i].income * 100}%` }}
                  />
                </span>
                <span className="relative flex-1">
                  <span
                    className={cn(
                      "bg-muted-foreground absolute top-0.5 left-1/2 w-[56%] max-w-4 -translate-x-1/2 rounded-b-sm",
                      partial && "opacity-60",
                    )}
                    style={{ height: `${columns[i].expenses * 100}%` }}
                  />
                </span>
                <span
                  className={cn(
                    "text-caption pt-1 text-center leading-none whitespace-nowrap",
                    isSelected ? "text-foreground font-bold" : "text-muted-foreground",
                  )}
                >
                  {HEBREW_MONTHS_SHORT[m.month - 1].replace("׳", "")}
                </span>
                <span className="sr-only">
                  {name}
                  {partial ? " (חלקי)" : ""}: נכנס {formatILS(m.income)}, יצא{" "}
                  {formatILS(m.expenses)}
                </span>
              </>
            );
            const column = cn(
              "flex h-full min-w-0 flex-col rounded-lg py-1",
              isSelected && "bg-muted",
            );
            return (
              <li key={`${m.year}-${m.month}`} className="flex min-w-0 flex-1">
                {isBrowsable(month, range) ? (
                  <a
                    href={homeHref(month, range.current)}
                    aria-current={isSelected ? "date" : undefined}
                    onClick={(e) => {
                      if (!isPlainClick(e)) return;
                      e.preventDefault();
                      onSelect(month);
                    }}
                    className={cn(
                      column,
                      "hover:bg-muted/60 focus-visible:ring-ring/50 w-full outline-none focus-visible:ring-3",
                    )}
                  >
                    {body}
                  </a>
                ) : (
                  <span
                    role="link"
                    aria-disabled="true"
                    className={cn(column, "w-full opacity-50")}
                  >
                    {body}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** The same card with an empty plot, so the swap to bars shifts nothing. */
export function YearChartSkeleton() {
  return (
    <div aria-hidden className={CHART_CARD}>
      <div className={HEAD}>
        <div className={LINE}>
          <span className="text-caption">
            <Bone className="w-40" />
          </span>
        </div>
        <div className={LINE}>
          <span className="text-caption">
            <Bone className="w-32" />
          </span>
        </div>
      </div>
      <div className={PLOT}>
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="bg-muted flex-1 animate-pulse rounded-lg" />
        ))}
      </div>
    </div>
  );
}
