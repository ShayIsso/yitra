"use client";

import * as React from "react";
import {
  ArrowCircleDownIcon,
  ArrowCircleUpIcon,
  CaretDownIcon,
  ChartLineUpIcon,
  CheckCircleIcon,
  DownloadSimpleIcon,
  PercentIcon,
  PiggyBankIcon,
  ReceiptIcon,
} from "@/components/icons";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetRow, SavingsVerdictChip } from "@/components/budget-status-card";
import { cn } from "@/lib/utils";
// Runtime helpers come from DB-free leaf modules; the report shapes are
// type-only imports (build-erased) so no DB code reaches the client bundle
// (issue #168 / PR #185, a deliberate exception to the index-only import rule).
import { monthDateRange } from "@/lib/analytics/month-window";
// Same searchParams builder the transactions page's own CSV export link uses
// (issue #169), so the two links can never diverge on filter shape.
import { buildFilterSearchParams } from "@/lib/transactions/filter-params";
import type { ReportMonth, MonthlyReportWithVerdicts } from "@/lib/reports";
import type { MonthlyReport, MonthlyReportNode, YoyValue } from "@/lib/reports/monthly";
import type { MonthCloseVerdicts } from "@/lib/reports/month-close";
import { formatInvestment, formatPercent, monthKey, monthLabel } from "./format";
import {
  CategoryDot,
  DeltaChip,
  ReportSection,
  ReportsEmpty,
  SectionError,
  type GoodDirection,
} from "./parts";
import { useJson } from "./use-json";

/**
 * Default selection = the most recent CLOSED month. The reports page studies
 * past months (issue #168), so it must not open on the in-progress month the
 * home screen already shows. The current month stays selectable; only the
 * default skips it. `months` is newest-first.
 */
function defaultMonth(months: ReportMonth[]): ReportMonth | null {
  if (months.length === 0) return null;
  const now = new Date();
  const isCurrent = (m: ReportMonth) =>
    m.year === now.getFullYear() && m.month === now.getMonth() + 1;
  if (isCurrent(months[0]) && months[1]) return months[1];
  return months[0];
}

function csvHref(m: ReportMonth): string {
  const { from, to } = monthDateRange(m.year, m.month);
  const params = buildFilterSearchParams({
    dateFrom: from,
    dateTo: to,
    categoryId: "",
    status: "",
    search: "",
  });
  return `/api/transactions/export?${params.toString()}`;
}

export function MonthlyView() {
  const months = useJson<ReportMonth[]>("/api/reports/months");
  const [pickedKey, setPickedKey] = React.useState<string | null>(null);

  const monthList = months.state.status === "ready" ? months.state.data : null;
  const selected = React.useMemo(() => {
    if (!monthList) return null;
    return monthList.find((m) => monthKey(m) === pickedKey) ?? defaultMonth(monthList);
  }, [monthList, pickedKey]);

  const report = useJson<MonthlyReportWithVerdicts>(
    selected ? `/api/reports/monthly?year=${selected.year}&month=${selected.month}` : null,
  );

  if (months.state.status === "error") {
    return <SectionError what="רשימת החודשים" onRetry={months.retry} />;
  }
  if (months.state.status === "loading") {
    return <MonthlySkeleton withToolbar />;
  }
  if (!monthList || monthList.length === 0 || !selected) {
    return (
      <ReportsEmpty
        icon={ChartLineUpIcon}
        title="עוד אין על מה לדווח"
        body="דוחות נבנים מהעסקאות שמגיעות מהבנק. אחרי החיבור והסנכרון הראשון יופיע כאן כל חודש שנסגר."
        cta={{ label: "חיבור בנק", href: "/settings" }}
      />
    );
  }

  const label = monthLabel(selected);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={monthKey(selected)} onValueChange={(v) => v && setPickedKey(v)}>
          <SelectTrigger
            aria-label="חודש הדוח"
            className="h-11 min-w-44 flex-1 sm:flex-none md:h-9"
          >
            {/* base-ui SelectValue renders the raw value; the codebase idiom
                puts the resolved label in the trigger. */}
            <span>{label}</span>
          </SelectTrigger>
          <SelectContent>
            {monthList.map((m) => (
              <SelectItem key={monthKey(m)} value={monthKey(m)}>
                {monthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="h-11 gap-1.5 md:h-9"
          nativeButton={false}
          render={<a href={csvHref(selected)} />}
        >
          <DownloadSimpleIcon className="size-4" />
          הורדת עסקאות החודש
          <span className="sr-only">(CSV, {label})</span>
        </Button>
      </div>

      {report.state.status === "error" ? (
        <SectionError what={`הדוח של ${label}`} onRetry={report.retry} />
      ) : report.state.status === "loading" ? (
        <MonthlySkeleton />
      ) : (
        <div
          className={cn("space-y-8 transition-opacity", report.state.stale && "opacity-60")}
          aria-busy={report.state.stale}
        >
          <MonthReport report={report.state.data} label={label} />
        </div>
      )}
    </div>
  );
}

function MonthReport({ report, label }: { report: MonthlyReportWithVerdicts; label: string }) {
  return (
    <>
      {report.hasData ? (
        <SummarySection report={report} label={label} />
      ) : (
        <ReportsEmpty
          icon={ReceiptIcon}
          title={`אין עסקאות ב${label}`}
          body="בחודש הזה לא נרשמה אף עסקה. אפשר לבחור חודש אחר מהרשימה."
        />
      )}
      {/* Independent of hasData: a closed month can carry a meaningful budget or
          target result (a ₪0-spend month still resolves comfortably-under) even
          with no transactions to show in the summary or breakdown. */}
      <MonthCloseSection monthClose={report.monthClose} />
      {report.hasData && <BreakdownSection report={report} label={label} />}
    </>
  );
}

// ── summary tiles ─────────────────────────────────────────────────────────────

type Metric = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string; weight?: "duotone" }>;
  value: YoyValue;
  good: GoodDirection;
  render: (v: number) => React.ReactNode;
  points?: boolean;
};

function comparableRate(income: number | null, rate: number | null): number | null {
  return income !== null && income > 0 && rate !== null && rate >= -100 ? rate : null;
}

function metrics(s: MonthlyReport["summary"]): Metric[] {
  return [
    {
      key: "income",
      label: "הכנסות",
      icon: ArrowCircleDownIcon,
      value: s.income,
      good: "up",
      render: (v) => <Amount amount={v} colorize={false} fractionDigits={0} />,
    },
    {
      key: "expenses",
      label: "הוצאות",
      icon: ArrowCircleUpIcon,
      value: s.expenses,
      good: "down",
      render: (v) => <Amount amount={v} colorize={false} fractionDigits={0} />,
    },
    {
      key: "netSavings",
      label: "חיסכון נטו",
      icon: PiggyBankIcon,
      value: s.netSavings,
      good: "up",
      // Money colour by sign, and the sign itself is printed: never colour alone.
      render: (v) => <Amount amount={Math.round(v) || 0} fractionDigits={0} />,
    },
    {
      // Without income, or past -100% off a sliver of it, the rate is not a
      // figure to read or compare (spec #312 story 28): "—", never a 0%.
      key: "savingsRate",
      label: "אחוז חיסכון",
      icon: PercentIcon,
      value: {
        current: s.savingsRate.current,
        lastYear: comparableRate(s.income.lastYear, s.savingsRate.lastYear),
      },
      good: "up",
      points: true,
      render: (v) => <span className="tabular-nums">{formatPercent(v)}</span>,
    },
    {
      // Investment is deployment of savings: more or less of it has no inherent
      // good direction (issue #168).
      key: "investment",
      label: "השקעה נטו",
      icon: ChartLineUpIcon,
      value: s.investment,
      good: "neutral",
      render: (v) => <span className="tabular-nums">{formatInvestment(v)}</span>,
    },
  ];
}

function SummarySection({ report, label }: { report: MonthlyReport; label: string }) {
  const incomeNow = report.summary.income.current;
  return (
    <ReportSection
      id="report-summary"
      title="סיכום החודש"
      description={`${label} מול אותו חודש אשתקד`}
    >
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {metrics(report.summary).map((m) => {
          const Icon = m.icon;
          const noRate =
            m.key === "savingsRate" &&
            comparableRate(incomeNow, report.summary.savingsRate.current) === null;
          return (
            <li
              key={m.key}
              className={cn(
                "bg-card flex min-w-0 flex-col gap-2 rounded-xl border border-[color:var(--card-border)] p-4 shadow-[var(--card-shadow)]",
                m.key === "investment" && "col-span-2 sm:col-span-1",
              )}
            >
              <span className="text-body text-muted-foreground flex items-center gap-2 font-medium">
                <span className="bg-muted text-primary grid size-7 shrink-0 place-items-center rounded-lg">
                  <Icon weight="duotone" className="size-4" />
                </span>
                {m.label}
              </span>
              <span className="text-title font-bold tracking-tight">
                {noRate ? "—" : m.render(m.value.current)}
              </span>
              <span className="text-caption text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>
                  אשתקד{" "}
                  {m.value.lastYear === null ? (
                    "—"
                  ) : m.key === "savingsRate" ? (
                    <span className="tabular-nums">{formatPercent(m.value.lastYear)}</span>
                  ) : m.key === "investment" ? (
                    <span className="tabular-nums">{formatInvestment(m.value.lastYear)}</span>
                  ) : (
                    <Amount amount={m.value.lastYear} colorize={false} fractionDigits={0} />
                  )}
                </span>
                {!noRate && (
                  <DeltaChip
                    current={m.value.current}
                    previous={m.value.lastYear}
                    good={m.good}
                    points={m.points}
                    comparedTo="אשתקד"
                  />
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </ReportSection>
  );
}

// ── month-close verdicts (issue #169) ─────────────────────────────────────────
// Closed months only, and only when there is something to show. Chip
// vocabulary comes straight from the budget card (BudgetRow /
// SavingsVerdictChip): no parallel chip implementation here.
function MonthCloseSection({ monthClose }: { monthClose: MonthCloseVerdicts }) {
  if (!monthClose.monthClosed) return null;
  if (monthClose.budgets.length === 0 && !monthClose.savingsTarget) return null;

  return (
    <ReportSection
      id="report-month-close"
      title="מול התקציבים והיעדים"
      description="לפי הגדרות התקציב והיעד הנוכחיות, גם אם השתנו מאז."
    >
      <Card className="gap-0 py-0">
        <ul className="divide-y">
          {monthClose.savingsTarget && (
            <li className="text-body flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="text-muted-foreground">יעד חיסכון נטו</span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">
                  <Amount
                    amount={monthClose.savingsTarget.netSavings}
                    colorize={false}
                    fractionDigits={0}
                  />{" "}
                  מתוך{" "}
                  <Amount
                    amount={monthClose.savingsTarget.target}
                    colorize={false}
                    fractionDigits={0}
                  />
                </span>
                <SavingsVerdictChip verdict={monthClose.savingsTarget.verdict} />
              </span>
            </li>
          )}
          {monthClose.budgets.map((b) => (
            <li key={b.id} className="px-4 py-3">
              <BudgetRow budget={b} />
            </li>
          ))}
        </ul>
      </Card>
    </ReportSection>
  );
}

// ── category breakdown ────────────────────────────────────────────────────────

// One grid template serves the phone list and the desktop table: below lg the
// row stacks name/amount, the bar, then last year/change/share; from lg every
// field takes its own column under the header row.
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 [grid-template-areas:'name_amount'_'bar_bar'_'meta_share'] lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_6.5rem_6.5rem_5.5rem_3rem] lg:items-center lg:gap-y-0 lg:[grid-template-areas:'name_bar_amount_last_delta_share']";

function BreakdownSection({ report, label }: { report: MonthlyReport; label: string }) {
  const [compare, setCompare] = React.useState(false);
  const showGhost = compare && report.hasLastYear;
  const total = report.breakdown.reduce((s, n) => s + n.amount, 0);
  const max = Math.max(
    0,
    // Last year sets the scale even while hidden, so toggling it never resizes the bars.
    ...report.breakdown.map((n) => Math.max(n.amount, n.lastYearAmount ?? 0)),
  );

  return (
    <ReportSection
      id="report-breakdown"
      title="הוצאות לפי קטגוריה"
      description="נטו לכל קטגוריה; קטגוריה שהזיכויים בה כיסו את ההוצאה לא מופיעה."
      action={
        report.breakdown.length > 0 && (
          <Button
            variant="outline"
            aria-pressed={showGhost}
            disabled={!report.hasLastYear}
            onClick={() => setCompare((c) => !c)}
            className={cn("h-11 gap-1.5 md:h-9", showGhost && "bg-muted")}
          >
            {showGhost && <CheckCircleIcon weight="fill" className="text-primary size-4" />}
            {report.hasLastYear ? "השוואה לאשתקד" : "אין נתוני אשתקד"}
          </Button>
        )
      }
    >
      <Card className="gap-0 py-0">
        {report.breakdown.length === 0 ? (
          <p className="text-body text-muted-foreground px-4 py-8 text-center">
            אין הוצאות מסווגות ב{label}.
          </p>
        ) : (
          <>
            <div
              aria-hidden
              className={cn(
                ROW_GRID,
                "text-caption text-muted-foreground hidden border-b px-4 py-2.5 font-medium lg:grid",
              )}
            >
              <span className="[grid-area:name]">קטגוריה</span>
              <span className="[grid-area:bar]" />
              <span className="text-end [grid-area:amount]">{label}</span>
              <span className="text-end [grid-area:last]">אשתקד</span>
              <span className="text-end [grid-area:delta]">שינוי</span>
              <span className="text-end [grid-area:share]">נתח</span>
            </div>
            <ul className="divide-y">
              {report.breakdown.map((node) => (
                <BreakdownRow
                  key={node.categoryId}
                  node={node}
                  total={total}
                  max={max}
                  showGhost={showGhost}
                />
              ))}
            </ul>
          </>
        )}
      </Card>
      {showGhost && (
        <p className="text-caption text-muted-foreground">
          הקו הקצר על כל פס מסמן את ההוצאה באותו חודש אשתקד.
        </p>
      )}
    </ReportSection>
  );
}

function ShareBar({
  amount,
  lastYear,
  max,
  showGhost,
  strong,
}: {
  amount: number;
  lastYear: number | null;
  max: number;
  showGhost: boolean;
  strong: boolean;
}) {
  const pct = (v: number) => (max > 0 ? `${Math.min(100, (v / max) * 100)}%` : "0%");
  return (
    <div aria-hidden className="relative self-center [grid-area:bar]">
      <div className="bg-muted relative h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={cn(
            "absolute inset-y-0 start-0 rounded-full",
            strong ? "bg-bar-strong" : "bg-muted-foreground/45",
          )}
          style={{ width: pct(amount) }}
        />
      </div>
      {showGhost && lastYear !== null && lastYear > 0 && (
        // Last year as a tick across the bar, not a second bar: one mark per
        // value keeps the row readable where the two lengths overlap.
        <div
          className="bg-foreground absolute -inset-y-1 w-0.5 rounded-full"
          style={{ insetInlineStart: `calc(${pct(lastYear)} - 1px)` }}
        />
      )}
    </div>
  );
}

function RowFigures({
  amount,
  lastYear,
  share,
  strong,
}: {
  amount: number;
  lastYear: number | null;
  share: number | null;
  strong: boolean;
}) {
  return (
    <>
      <span className={cn("text-body text-end [grid-area:amount]", strong && "font-semibold")}>
        <Amount amount={amount} colorize={false} fractionDigits={0} />
      </span>
      <span className="text-caption text-muted-foreground flex items-center gap-2 [grid-area:meta] lg:contents">
        <span className="lg:text-body lg:text-end lg:[grid-area:last]">
          <span className="lg:sr-only">אשתקד </span>
          {/* A zero last year is "—": no fabricated comparison (issue #168). */}
          {lastYear === null || lastYear === 0 ? (
            "—"
          ) : (
            <Amount amount={lastYear} colorize={false} fractionDigits={0} />
          )}
        </span>
        <span className="lg:text-end lg:[grid-area:delta]">
          <DeltaChip current={amount} previous={lastYear} good="down" comparedTo="אשתקד" />
        </span>
      </span>
      <span className="text-caption text-muted-foreground lg:text-body text-end tabular-nums [grid-area:share]">
        {share === null ? "" : `${share}%`}
        {share !== null && <span className="sr-only"> מסך ההוצאות</span>}
      </span>
    </>
  );
}

function BreakdownRow({
  node,
  total,
  max,
  showGhost,
}: {
  node: MonthlyReportNode;
  total: number;
  max: number;
  showGhost: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const isGroup = node.children.length > 0;
  const share = total > 0 ? Math.round((node.amount / total) * 100) : 0;
  const childrenId = `breakdown-${node.categoryId}`;

  const name = (
    <span className="flex min-w-0 items-center gap-2">
      <CategoryDot color={node.color} />
      <span className="truncate font-medium">{node.categoryName}</span>
      {isGroup && (
        <span className="text-caption text-muted-foreground shrink-0">
          ({node.children.length})
        </span>
      )}
    </span>
  );

  return (
    <li>
      <div className={cn(ROW_GRID, "px-4 py-3")}>
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
        <ShareBar
          amount={node.amount}
          lastYear={node.lastYearAmount}
          max={max}
          showGhost={showGhost}
          strong
        />
        <RowFigures amount={node.amount} lastYear={node.lastYearAmount} share={share} strong />
      </div>
      {isGroup && open && (
        <ul id={childrenId} className="bg-muted/40 divide-y border-t">
          {node.children.map((leaf) => (
            <li key={leaf.categoryId} className={cn(ROW_GRID, "py-2.5 ps-10 pe-4")}>
              <span className="text-body flex min-w-0 items-center gap-2 [grid-area:name]">
                <CategoryDot color={leaf.color} />
                <span className="truncate">{leaf.categoryName}</span>
              </span>
              <ShareBar
                amount={leaf.amount}
                lastYear={leaf.lastYearAmount}
                max={max}
                showGhost={showGhost}
                strong={false}
              />
              <RowFigures
                amount={leaf.amount}
                lastYear={leaf.lastYearAmount}
                share={null}
                strong={false}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ── skeleton ──────────────────────────────────────────────────────────────────

export function MonthlySkeleton({ withToolbar = false }: { withToolbar?: boolean }) {
  return (
    <div className="space-y-8" role="status" aria-busy aria-label="טוען את הדוח">
      {withToolbar && (
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-11 min-w-44 flex-1 rounded-lg sm:flex-none md:h-9" />
          <Skeleton className="h-11 w-48 rounded-lg md:h-9" />
        </div>
      )}
      <div className="space-y-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-5 w-48" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton
              key={i}
              className={cn("h-[7.5rem] rounded-xl", i === 4 && "col-span-2 sm:col-span-1")}
            />
          ))}
        </div>
      </div>
      {/* The default month is closed, so the budget and target verdicts usually render. */}
      <div className="space-y-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-5 w-72 max-w-full" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-5 w-64 max-w-full" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
