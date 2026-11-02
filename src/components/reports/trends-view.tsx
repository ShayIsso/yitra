"use client";

import * as React from "react";
import { CaretDownIcon, ChartLineUpIcon } from "@/components/icons";
import { Amount } from "@/components/ui/amount";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type {
  TrendsCategorySeries,
  TrendsGroupSeries,
  TrendsMonthPoint,
  TrendsReport,
  TrendsYearRow,
} from "@/lib/reports/trends";
import { HEBREW_MONTHS, formatInvestment, formatILS } from "./format";
import { CategoryDot, DeltaChip, ReportSection, ReportsEmpty, SectionError } from "./parts";
import { TrendsChart, TrendsLegend } from "./trends-chart";
import { useJson } from "./use-json";

const RANGE_OPTIONS = [6, 12, 24];

export function TrendsView() {
  const [range, setRange] = React.useState(12);
  const trends = useJson<TrendsReport>(`/api/reports/trends?range=${range}`);

  return (
    <div className="space-y-8">
      <Select value={String(range)} onValueChange={(v) => v && setRange(Number(v))}>
        <SelectTrigger aria-label="טווח המגמה" className="h-11 w-full sm:w-48 md:h-9">
          <span>{range} חודשים אחרונים</span>
        </SelectTrigger>
        <SelectContent>
          {RANGE_OPTIONS.map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n} חודשים אחרונים
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {trends.state.status === "error" ? (
        <SectionError what="המגמות" onRetry={trends.retry} />
      ) : trends.state.status === "loading" ? (
        <TrendsSkeleton />
      ) : !trends.state.data.hasData ? (
        <ReportsEmpty
          icon={ChartLineUpIcon}
          title="עוד אין מגמה להראות"
          body={`ב-${range} החודשים האחרונים לא נרשמו עסקאות. מגמות נבנות אחרי שהבנק מסונכרן.`}
          cta={{ label: "לסנכרון", href: "/sync" }}
        />
      ) : (
        <div
          className={cn("space-y-8 transition-opacity", trends.state.stale && "opacity-60")}
          aria-busy={trends.state.stale}
        >
          <MonthlyTrendSection months={trends.state.data.months} />
          {trends.state.data.years.length > 0 && <YearsSection years={trends.state.data.years} />}
          <CategoryTrendsSection report={trends.state.data} />
        </div>
      )}
    </div>
  );
}

// ── month-by-month chart ──────────────────────────────────────────────────────

function MonthlyTrendSection({ months }: { months: TrendsMonthPoint[] }) {
  return (
    <ReportSection
      id="trends-monthly"
      title="מגמה חודשית"
      description="החודש הנוכחי חלקי ומוצג בשקיפות."
    >
      <Card className="gap-3 px-4">
        <TrendsLegend />
        <TrendsChart points={months} />
        <details className="group border-t pt-3">
          <summary className="text-body text-primary flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium md:min-h-8 [&::-webkit-details-marker]:hidden">
            <CaretDownIcon className="size-4 rotate-90 transition-transform group-open:rotate-0" />
            הנתונים כטבלה
          </summary>
          <table className="text-caption mt-2 w-full">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 text-start font-medium">חודש</th>
                <th className="py-2 text-end font-medium">הכנסות</th>
                <th className="py-2 text-end font-medium">הוצאות</th>
                <th className="py-2 text-end font-medium">חיסכון נטו</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...months].reverse().map((p) => (
                <tr key={`${p.year}-${p.month}`}>
                  <td className="py-2">
                    {HEBREW_MONTHS[p.month - 1]} {p.year}
                  </td>
                  <td className="py-2 text-end">
                    <Amount amount={p.income} colorize={false} fractionDigits={0} />
                  </td>
                  <td className="py-2 text-end">
                    <Amount amount={p.expenses} colorize={false} fractionDigits={0} />
                  </td>
                  <td className="py-2 text-end font-semibold">
                    <Amount amount={Math.round(p.netSavings) || 0} fractionDigits={0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>
    </ReportSection>
  );
}

// ── annual totals (decision record #107: folded into trends) ──────────────────

const YEAR_GRID =
  "grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-[7rem_repeat(4,minmax(0,1fr))] md:items-center md:gap-y-0";

function YearsSection({ years }: { years: TrendsYearRow[] }) {
  const figures = (y: TrendsYearRow) => [
    { label: "הכנסות", node: <Amount amount={y.income} colorize={false} fractionDigits={0} /> },
    { label: "הוצאות", node: <Amount amount={y.expenses} colorize={false} fractionDigits={0} /> },
    {
      label: "חיסכון נטו",
      node: <Amount amount={Math.round(y.netSavings) || 0} fractionDigits={0} />,
      strong: true,
    },
    {
      label: "השקעה נטו",
      node: <span className="tabular-nums">{formatInvestment(y.investment)}</span>,
    },
  ];
  return (
    <ReportSection
      id="trends-years"
      title="סיכום שנתי"
      description="שנה שהטווח חותך מסומנת במספר החודשים שבה."
    >
      <Card className="gap-0 py-0">
        <div
          aria-hidden
          className={cn(
            YEAR_GRID,
            "text-caption text-muted-foreground hidden border-b px-4 py-2.5 font-medium md:grid",
          )}
        >
          <span>שנה</span>
          <span className="text-end">הכנסות</span>
          <span className="text-end">הוצאות</span>
          <span className="text-end">חיסכון נטו</span>
          <span className="text-end">השקעה נטו</span>
        </div>
        <ul className="divide-y">
          {years.map((y) => (
            <li key={y.year} className={cn(YEAR_GRID, "px-4 py-3")}>
              <span className="text-lead md:text-body col-span-2 font-semibold tabular-nums md:col-span-1">
                {y.year}
                {y.monthCount < 12 && (
                  <span className="text-caption text-muted-foreground ms-1.5 font-normal">
                    ({y.monthCount} חודשים)
                  </span>
                )}
              </span>
              {figures(y).map((f) => (
                <span key={f.label} className="flex flex-col md:block md:text-end">
                  <span className="text-caption text-muted-foreground md:sr-only">{f.label}</span>
                  <span className={cn("text-body", f.strong && "font-semibold")}>{f.node}</span>
                </span>
              ))}
            </li>
          ))}
        </ul>
      </Card>
    </ReportSection>
  );
}

// ── per-category trends ───────────────────────────────────────────────────────

const CAT_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 [grid-template-areas:'name_amount'_'bars_delta'] lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_6.5rem_5.5rem] lg:items-center lg:gap-y-0 lg:[grid-template-areas:'name_bars_amount_delta']";

function CategoryTrendsSection({ report }: { report: TrendsReport }) {
  return (
    <ReportSection
      id="trends-categories"
      title="מגמה לפי קטגוריה"
      description="סכום של קבוצה שווה תמיד לסכום הקטגוריות שבה. פתחו קבוצה כדי לראות אותן."
    >
      <Card className="gap-0 py-0">
        {report.breakdown.length === 0 ? (
          <p className="text-body text-muted-foreground px-4 py-8 text-center">
            אין הוצאות מסווגות בטווח הזה.
          </p>
        ) : (
          <>
            <div
              aria-hidden
              className={cn(
                CAT_GRID,
                "text-caption text-muted-foreground hidden border-b px-4 py-2.5 font-medium lg:grid",
              )}
            >
              <span className="[grid-area:name]">קטגוריה</span>
              <span className="[grid-area:bars]">לאורך הטווח</span>
              <span className="text-end [grid-area:amount]">החודש הנוכחי (חלקי)</span>
              <span className="text-end [grid-area:delta]">מול הקודם</span>
            </div>
            <ul className="divide-y">
              {report.breakdown.map((series) => (
                <CategoryTrendRow key={series.categoryId} series={series} months={report.months} />
              ))}
            </ul>
          </>
        )}
      </Card>
    </ReportSection>
  );
}

/**
 * Neutral bars, one per month, oldest at the right like every time chart; the
 * category dot on the row is the identity mark. Each row scales to its own
 * max so the SHAPE reads; magnitude is the amount beside it. The latest month
 * takes the emphasis fill.
 */
function MiniBars({ amounts, months }: { amounts: number[]; months: TrendsMonthPoint[] }) {
  const max = Math.max(0, ...amounts);
  const [hover, setHover] = React.useState<number | null>(null);
  const last = amounts.length - 1;
  return (
    <div className="relative flex h-7 items-end gap-0.5 [grid-area:bars]" aria-hidden>
      {amounts.map((a, i) => (
        <div
          key={i}
          className={cn(
            "min-w-[2px] flex-1 rounded-t-sm",
            i === last ? "bg-bar-strong" : "bg-muted-foreground/35",
            hover === i && "opacity-70",
          )}
          style={{ height: max > 0 ? `${Math.max(6, (a / max) * 100)}%` : "6%" }}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover((h) => (h === i ? null : h))}
        />
      ))}
      {hover !== null && months[hover] && (
        <div
          className="bg-popover text-popover-foreground text-caption pointer-events-none absolute bottom-full z-10 mb-1 rounded-lg border px-2 py-1 whitespace-nowrap shadow-[var(--card-shadow)] ltr:-translate-x-1/2 rtl:translate-x-1/2"
          style={{ insetInlineStart: `${((hover + 0.5) / amounts.length) * 100}%` }}
        >
          <span className="font-medium">
            {HEBREW_MONTHS[months[hover].month - 1]} {months[hover].year}
          </span>
          <span className="text-muted-foreground"> · </span>
          <span className="tabular-nums">{formatILS(amounts[hover])}</span>
        </div>
      )}
    </div>
  );
}

function SeriesFigures({ amounts, strong }: { amounts: number[]; strong: boolean }) {
  const current = amounts[amounts.length - 1] ?? 0;
  const previous = amounts.length > 1 ? amounts[amounts.length - 2] : null;
  return (
    <>
      <span className={cn("text-body text-end [grid-area:amount]", strong && "font-semibold")}>
        <Amount amount={current} colorize={false} fractionDigits={0} />
      </span>
      <span className="flex items-center justify-end [grid-area:delta]">
        <DeltaChip current={current} previous={previous} good="down" comparedTo="החודש הקודם" />
      </span>
    </>
  );
}

function CategoryTrendRow({
  series,
  months,
}: {
  series: TrendsGroupSeries;
  months: TrendsMonthPoint[];
}) {
  const [open, setOpen] = React.useState(false);
  const isGroup = series.children.length > 0;
  const childrenId = `trend-${series.categoryId}`;
  const name = (
    <span className="flex min-w-0 items-center gap-2">
      <CategoryDot color={series.color} />
      <span className="truncate font-medium">{series.categoryName}</span>
    </span>
  );
  return (
    <li>
      <div className={cn(CAT_GRID, "px-4 py-3")}>
        {isGroup ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={childrenId}
            onClick={() => setOpen((o) => !o)}
            className="focus-visible:ring-ring/50 -my-2 -ms-2 flex min-h-11 min-w-0 items-center gap-1 rounded-lg ps-2 text-start outline-none [grid-area:name] focus-visible:ring-3"
          >
            <CaretDownIcon
              className={cn(
                "text-muted-foreground size-4 shrink-0 transition-transform",
                !open && "rotate-90",
              )}
            />
            {name}
          </button>
        ) : (
          <span className="flex min-h-7 items-center ps-5 [grid-area:name]">{name}</span>
        )}
        <MiniBars amounts={series.amounts} months={months} />
        <SeriesFigures amounts={series.amounts} strong />
      </div>
      {isGroup && open && (
        <ul id={childrenId} className="bg-muted/40 divide-y border-t">
          {series.children.map((leaf: TrendsCategorySeries) => (
            <li key={leaf.categoryId} className={cn(CAT_GRID, "py-2.5 ps-10 pe-4")}>
              <span className="text-body flex min-w-0 items-center gap-2 [grid-area:name]">
                <CategoryDot color={leaf.color} />
                <span className="truncate">{leaf.categoryName}</span>
              </span>
              <MiniBars amounts={leaf.amounts} months={months} />
              <SeriesFigures amounts={leaf.amounts} strong={false} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ── skeleton ──────────────────────────────────────────────────────────────────

function TrendsSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-busy aria-label="טוען את המגמות">
      <div className="space-y-3">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-5 w-56 max-w-full" />
        <Skeleton className="h-[22rem] rounded-xl" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-64 max-w-full" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
