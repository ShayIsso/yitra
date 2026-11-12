"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowsClockwiseIcon, WarningCircleIcon } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Amount } from "@/components/ui/amount";
import { cn } from "@/lib/utils";
import { SpendingBreakdown } from "@/components/spending-breakdown";
import type { MonthlySummary, CategorySpendingNode } from "@/lib/analytics";
import type { HomeMonth } from "@/components/home/month";
import { useMonthLoad } from "@/components/home/month-load";
import { monthKey } from "@/components/reports/format";
import type { TrendsMonthPoint, TrendsReport } from "@/lib/reports";
import { TrendMiniChart } from "@/components/dashboard/trend-mini-chart";

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

type DashboardData = {
  summary: MonthlySummary | null;
  spending: CategorySpendingNode[];
  trend: TrendsMonthPoint[];
};

async function fetchDashboardData(
  year: number,
  month: number,
  signal: AbortSignal,
): Promise<DashboardData> {
  const get = (url: string) => fetch(url, { signal });
  const [summaryRes, spendingRes, trendRes] = await Promise.all([
    get(`/api/analytics/monthly?year=${year}&month=${month}`),
    get(`/api/analytics/spending-rollup?year=${year}&month=${month}`),
    get(`/api/reports/trends?range=12`),
  ]);

  const [summary, spending, trendReport] = await Promise.all([
    summaryRes.ok ? summaryRes.json() : null,
    spendingRes.ok ? spendingRes.json() : [],
    trendRes.ok ? (trendRes.json() as Promise<TrendsReport>) : null,
  ]);

  return { summary, spending, trend: trendReport?.months ?? [] };
}

const SAVINGS_RATE_LABEL = "אחוז חיסכון";
/** The KPI band's tile labels, in order; the loading skeleton renders the same tiles. */
const KPI_LABELS = ["הכנסות", "הוצאות", "חיסכון נטו", SAVINGS_RATE_LABEL] as const;

function KpiTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * The KPI band, the category breakdown and the trend mini chart below the home
 * hero, for the month the home screen selected. Memoized: the home screen re-renders on every clock tick and sync-stream
 * frame, and nothing here depends on either.
 *
 * It loads as soon as it mounts, beside the outlook, but draws nothing until
 * `visible`: the home screen withholds it in a first-run state. `refreshKey`
 * changes when the data changed (a target saved, a sync settled); a refetch of
 * the same month keeps the sections on screen, and only a month change shows
 * the skeleton.
 */
export const DashboardPanel = React.memo(function DashboardPanel({
  month,
  refreshKey,
  visible,
}: {
  month: HomeMonth;
  refreshKey: string;
  visible: boolean;
}) {
  const { year, month: monthNumber } = month;
  const [attempt, setAttempt] = React.useState(0);
  const load = useMonthLoad(monthKey(month), `${refreshKey}:${attempt}`, (signal) =>
    // A microtask later: child effects run before their parent's, and the
    // home screen's outlook request (the hero, first on screen) must not
    // queue behind these on the browser's per-host connection limit.
    Promise.resolve().then(() => fetchDashboardData(year, monthNumber, signal)),
  );
  const data = load.current ? load.data : null;

  if (!visible) return null;
  if (data === null) {
    return load.failed ? (
      <SectionsLoadError retrying={load.pending} onRetry={() => setAttempt((a) => a + 1)} />
    ) : (
      <DashboardSkeleton />
    );
  }
  return <DashboardSections data={data} />;
});

function DashboardSections({ data }: { data: DashboardData }) {
  const { summary, spending, trend } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile label={KPI_LABELS[0]}>
          {summary ? (
            <Amount amount={summary.income} fractionDigits={0} className="text-2xl font-bold" />
          ) : (
            <p className="text-2xl font-bold">—</p>
          )}
        </KpiTile>

        <KpiTile label={KPI_LABELS[1]}>
          {summary ? (
            // summary.expenses is net outflow, positive for money out (CONTEXT.md
            // "net outflow"), so sign-driven colorize would read it as positive
            // money and go emerald. Expenses are money-out: force the --neg token.
            // A net-refund month (expenses < 0) is not money-out, so it stays neutral.
            <Amount
              amount={summary.expenses}
              fractionDigits={0}
              colorize={false}
              className={cn("text-2xl font-bold", summary.expenses > 0 && "text-neg")}
            />
          ) : (
            <p className="text-2xl font-bold">—</p>
          )}
        </KpiTile>

        <KpiTile label={KPI_LABELS[2]}>
          {summary ? (
            <Amount amount={summary.netSavings} fractionDigits={0} className="text-2xl font-bold" />
          ) : (
            <p className="text-2xl font-bold">—</p>
          )}
        </KpiTile>

        <KpiTile label={SAVINGS_RATE_LABEL}>
          <p
            className={`text-2xl font-bold ${
              summary && summary.savingsRate >= 0 ? "text-pos" : "text-neg"
            }`}
          >
            {summary ? formatPercent(summary.savingsRate) : "—"}
          </p>
          {summary && (
            <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
              <div
                className="bg-bar-strong h-full rounded-full transition-all"
                style={{ width: `${Math.min(Math.max(summary.savingsRate, 0), 100)}%` }}
              />
            </div>
          )}
        </KpiTile>
      </div>

      {/* Spending breakdown — group-first with drill-down (BGR5 #162). */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">הוצאות לפי קטגוריה</CardTitle>
        </CardHeader>
        <CardContent>
          <SpendingBreakdown nodes={spending} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TrendMiniChart months={trend} />
      </div>
    </div>
  );
}

/** The sections' own load failure: calm, with a retry for them alone. */
function SectionsLoadError({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  return (
    <Card
      role="alert"
      className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-body flex items-center gap-2">
        <WarningCircleIcon weight="fill" className="text-attention-text size-5 shrink-0" />
        לא הצלחנו לטעון את שאר הנתונים של החודש.
      </p>
      <Button
        variant="outline"
        className="h-11 gap-1.5 md:h-9"
        disabled={retrying}
        onClick={onRetry}
      >
        <ArrowsClockwiseIcon className="size-4" />
        {retrying ? "טוען..." : "נסה שוב"}
      </Button>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI band skeletons keep the loaded rows' heights, so the swap to
          content does not shift the page (CLS). */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {KPI_LABELS.map((label) => (
          <KpiTile key={label} label={label}>
            <Skeleton className="h-8 w-28" />
            {label === SAVINGS_RATE_LABEL && <Skeleton className="mt-2 h-2 w-full" />}
          </KpiTile>
        ))}
      </div>
      {/* Breakdown skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
