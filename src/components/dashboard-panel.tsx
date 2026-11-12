"use client";

import * as React from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BankBadge } from "@/components/bank-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Amount } from "@/components/ui/amount";
import { cn } from "@/lib/utils";
import { SpendingBreakdown } from "@/components/spending-breakdown";
import type { Category } from "@/lib/categories";
import type {
  MonthlySummary,
  CategorySpendingNode,
  AccountBalance,
  RecentTransaction,
  TopMerchant,
} from "@/lib/analytics";
import type { SyncRunSummary } from "@/lib/sync/runs";
import { GoalsProgressCard, type GoalProgressCardData } from "@/components/goals-progress-card";
import { BudgetStatusCard, type BudgetChipData } from "@/components/budget-status-card";
import type {
  BudgetPace,
  BudgetStatus,
  MonthlyTargetsData,
  SavingsTargetStatus,
} from "@/lib/budgets";
import type { HomeMonth } from "@/components/home/month";
import { useMonthLoad } from "@/components/home/month-load";
import { monthKey } from "@/components/reports/format";
import type { TrendsMonthPoint, TrendsReport } from "@/lib/reports";
import { AttentionCounters, type AttentionCounts } from "@/components/dashboard/attention-counters";
import { OnboardingPath } from "@/components/dashboard/onboarding-path";
import { TrendMiniChart } from "@/components/dashboard/trend-mini-chart";
import { TopMerchantsCard } from "@/components/dashboard/top-merchants-card";
import {
  UpcomingChargesCard,
  type UpcomingCharge,
} from "@/components/dashboard/upcoming-charges-card";

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

type BudgetsSummaryResponse = {
  budgets: BudgetStatus[];
  monthlyTargets: MonthlyTargetsData;
  savingsTarget: SavingsTargetStatus | null;
  expenseTargetPace: BudgetPace | null;
};

const EMPTY_BUDGETS_SUMMARY: BudgetsSummaryResponse = {
  budgets: [],
  monthlyTargets: { expenseTarget: null, savingsTarget: null },
  savingsTarget: null,
  expenseTargetPace: null,
};

type DashboardData = {
  summary: MonthlySummary | null;
  spending: CategorySpendingNode[];
  balances: AccountBalance[];
  recent: RecentTransaction[];
  upcomingCharges: UpcomingCharge[];
  upcomingTotal: number;
  goals: GoalProgressCardData[];
  goalsSurplus: number;
  budgetsSummary: BudgetsSummaryResponse;
  attention: AttentionCounts | null;
  topMerchants: TopMerchant[];
  trend: TrendsMonthPoint[];
};

type GoalsResponse = {
  goals: GoalProgressCardData[];
  surplus: number;
};

const EMPTY_GOALS_RESPONSE: GoalsResponse = { goals: [], surplus: 0 };

async function fetchDashboardData(
  year: number,
  month: number,
  signal: AbortSignal,
): Promise<DashboardData> {
  const get = (url: string) => fetch(url, { signal });
  const [
    summaryRes,
    spendingRes,
    balancesRes,
    recentRes,
    upcomingRes,
    goalsRes,
    budgetsSummaryRes,
    attentionRes,
    topMerchantsRes,
    trendRes,
  ] = await Promise.all([
    get(`/api/analytics/monthly?year=${year}&month=${month}`),
    get(`/api/analytics/spending-rollup?year=${year}&month=${month}`),
    get(`/api/analytics/balances`),
    // 8, not 15: the A′ layout puts the recent list in a half-width column
    // beside Upcoming, and a 15-row column dwarfs it. "צפה בהכל" carries the rest.
    get(`/api/analytics/recent?limit=8`),
    get(`/api/recurring-upcoming`),
    get(`/api/goals`),
    get(`/api/budgets-summary?year=${year}&month=${month}`),
    get(`/api/attention-counts`),
    get(`/api/analytics/top-merchants?year=${year}&month=${month}`),
    get(`/api/reports/trends?range=12`),
  ]);

  const [
    summary,
    spending,
    balances,
    recent,
    upcomingData,
    goalsData,
    budgetsSummary,
    attention,
    topMerchants,
    trendReport,
  ] = await Promise.all([
    summaryRes.ok ? summaryRes.json() : null,
    spendingRes.ok ? spendingRes.json() : [],
    balancesRes.ok ? balancesRes.json() : [],
    recentRes.ok ? recentRes.json() : [],
    upcomingRes.ok ? upcomingRes.json() : { upcoming: [], total: 0 },
    goalsRes.ok ? (goalsRes.json() as Promise<GoalsResponse>) : EMPTY_GOALS_RESPONSE,
    budgetsSummaryRes.ok ? budgetsSummaryRes.json() : EMPTY_BUDGETS_SUMMARY,
    attentionRes.ok ? (attentionRes.json() as Promise<AttentionCounts>) : null,
    topMerchantsRes.ok ? topMerchantsRes.json() : [],
    trendRes.ok ? (trendRes.json() as Promise<TrendsReport>) : null,
  ]);

  return {
    summary,
    spending,
    balances,
    recent,
    upcomingCharges: upcomingData.upcoming ?? [],
    upcomingTotal: upcomingData.total ?? 0,
    goals: goalsData.goals ?? [],
    goalsSurplus: goalsData.surplus ?? 0,
    budgetsSummary,
    attention,
    topMerchants,
    trend: trendReport?.months ?? [],
  };
}

// Dates formatted client-side to avoid hydration mismatch (CLAUDE.md rule).
//
// Not the upcoming-charges card's formatter: the balances card wants an
// unpadded "day.month" ("9.8"), not Intl's 2-digit form.
function formatDebitDateHint(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${day}.${month}`;
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
 * The old dashboard's sections below the home hero (#317), for the month the
 * home screen selected. Each later home ticket (#318–#321) replaces part of it.
 *
 * It loads as soon as it mounts, beside the outlook, but draws nothing until
 * `visible`: the home screen withholds it in a first-run state. `refreshKey`
 * changes when the data changed (a target saved, a sync settled); a refetch of
 * the same month keeps the sections on screen, and only a month change shows
 * the skeleton.
 */
export function DashboardPanel({
  categories,
  month,
  refreshKey,
  visible,
  credentialCount,
  lastSyncRuns,
}: {
  categories: Category[];
  month: HomeMonth;
  refreshKey: number;
  visible: boolean;
  /** Connected institutions the registry still knows; only existence is read (#264). */
  credentialCount: number;
  /** Last run per current institution, or null until the home screen has read them. */
  lastSyncRuns: SyncRunSummary[] | null;
}) {
  const { year, month: monthNumber } = month;
  const load = useMonthLoad(monthKey(month), refreshKey, (signal) =>
    // A microtask later: child effects run before their parent's, and the
    // home screen's outlook request (the hero, first on screen) must not
    // queue behind these eleven on the browser's per-host connection limit.
    Promise.resolve().then(() => fetchDashboardData(year, monthNumber, signal)),
  );
  const data = load.current ? load.data : null;

  const categoriesById = React.useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  if (!visible) return null;
  if (data === null) return <DashboardSkeleton />;
  return (
    <DashboardSections
      data={data}
      categoriesById={categoriesById}
      credentialCount={credentialCount}
      lastSyncRuns={lastSyncRuns}
    />
  );
}

function DashboardSections({
  data,
  categoriesById,
  credentialCount,
  lastSyncRuns,
}: {
  data: DashboardData;
  categoriesById: Map<string, Category>;
  credentialCount: number;
  lastSyncRuns: SyncRunSummary[] | null;
}) {
  const {
    summary,
    spending,
    balances,
    recent,
    upcomingCharges,
    upcomingTotal,
    goals,
    goalsSurplus,
    budgetsSummary,
    attention,
    topMerchants,
    trend,
  } = data;

  // Budgets only ever attach to expense-type categories (src/lib/budgets
  // enforces this at write time), so this lookup only ever needs to resolve
  // an expense category's display name/color for the chip row.
  const budgetChips: BudgetChipData[] = React.useMemo(
    () =>
      budgetsSummary.budgets.map(({ budget, pace }) => {
        const category = categoriesById.get(budget.categoryId);
        return {
          id: budget.id,
          categoryName: category?.name ?? "—",
          categoryColor: category?.color ?? "#9ca3af",
          verdict: pace.verdict,
          spent: pace.spent,
          limit: pace.limit,
        };
      }),
    [budgetsSummary.budgets, categoriesById],
  );

  // A brand-new account returns a zeroed summary object (not null), so checking
  // `summary === null` alone never fires. Treat an all-zero summary as empty too;
  // the other clauses (no balances/recent/spending/upcoming) keep an existing user
  // viewing a quiet month out of this branch — they still have bank balances.
  const summaryIsEmpty =
    summary === null ||
    (summary.income === 0 && summary.expenses === 0 && summary.investmentTotal === 0);

  const hasNoData =
    summaryIsEmpty &&
    spending.length === 0 &&
    balances.length === 0 &&
    recent.length === 0 &&
    upcomingCharges.length === 0;

  // Balances only appear once a sync has landed, so they cover the bank whose
  // latest run errored after an earlier success (the runs list is last-per-bank).
  const onboardingFacts =
    lastSyncRuns === null || attention === null
      ? null
      : {
          hasCredential: credentialCount > 0,
          hasSuccessfulSync:
            lastSyncRuns.some((run) => run.status === "success") || balances.length > 0,
          uncategorizedCount: attention.uncategorized,
        };

  return (
    <div className="space-y-6">
      <OnboardingPath facts={onboardingFacts} />

      {hasNoData ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Wallet}
              heading="אין נתונים"
              explainer="לא נטענו עסקאות. התחבר לבנק הראשון שלך כדי להתחיל."
              cta={{ label: "עבור להגדרות", href: "/settings" }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6 transition-opacity duration-150">
          {/* ── Monthly band — everything below is scoped to the month strip ── */}

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
                <Amount
                  amount={summary.netSavings}
                  fractionDigits={0}
                  className="text-2xl font-bold"
                />
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

          <AttentionCounters counts={attention} />

          {/* Spending breakdown — group-first with drill-down (BGR5 #162). Sits
              directly above budgets so the two monthly spend views are adjacent
              (#108 gate adjudication). */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">הוצאות לפי קטגוריה</CardTitle>
            </CardHeader>
            <CardContent>
              <SpendingBreakdown nodes={spending} />
            </CardContent>
          </Card>

          {/* Budgets — pace chips + targets headline (BGR9 #166). #205 dropped
              the spend-vs-ceiling headline from this card, giving the pace
              hero sole ownership of that figure; #234 consciously supersedes
              that and restores a plain actual-vs-target expense line here,
              distinct from the hero's pace verdict (see TargetsHeadline in
              budget-status-card.tsx). */}
          <BudgetStatusCard
            budgets={budgetChips}
            targetsHeadline={{
              expenseTarget: budgetsSummary.monthlyTargets.expenseTarget,
              expenseActual: summary?.expenses ?? 0,
              savingsTarget: budgetsSummary.savingsTarget,
            }}
          />

          {/* ── Long-horizon band — month-independent widgets: goals always
                track today's real month (CONTEXT.md "savings goal") and
                balances are current-state, so the month strip doesn't scope
                either of them. ── */}

          <GoalsProgressCard goals={goals} surplus={goalsSurplus} />

          {balances.length > 0 && (
            <div>
              <h3 className="mb-3 text-base font-semibold">יתרות חשבון</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {balances.map((acc) => (
                  <Card key={acc.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{acc.displayName}</p>
                          <p className="text-muted-foreground text-xs">
                            ****{acc.accountNumber.slice(-4)}
                          </p>
                        </div>
                        <div className="text-left">
                          <BankBadge
                            bankType={acc.bankType}
                            variant="outline"
                            className="mb-1 text-xs"
                          />
                          {acc.balance !== null ? (
                            <Amount
                              amount={acc.balance}
                              fractionDigits={0}
                              className="text-sm font-semibold"
                            />
                          ) : (
                            <p className="text-sm font-semibold">—</p>
                          )}
                          {acc.nextDebitDate && acc.balance !== 0 && (
                            <p className="text-muted-foreground mt-0.5 text-xs">
                              חיוב קרוב · {formatDebitDateHint(acc.nextDebitDate)}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Past | future activity, side by side */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold">עסקאות אחרונות</h3>
                <Link
                  href="/transactions"
                  className="text-muted-foreground text-sm hover:underline"
                >
                  צפה בהכל
                </Link>
              </div>
              <Card>
                <CardContent className="p-0">
                  {recent.length === 0 ? (
                    <p className="text-muted-foreground p-4 text-sm">אין עסקאות להצגה</p>
                  ) : (
                    <div className="divide-y">
                      {recent.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {tx.customDescription ?? tx.description}
                            </p>
                            <p className="text-muted-foreground text-xs">{tx.date}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                            {tx.categoryName && (
                              <Badge
                                variant="outline"
                                className="text-xs"
                                style={
                                  tx.categoryColor
                                    ? {
                                        borderColor: tx.categoryColor,
                                        color: tx.categoryColor,
                                      }
                                    : undefined
                                }
                              >
                                {tx.categoryName}
                              </Badge>
                            )}
                            <Amount
                              amount={tx.chargedAmount}
                              fractionDigits={0}
                              className="text-sm font-semibold"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            <div>
              <h3 className="mb-3 text-base font-semibold">צפוי בהמשך</h3>
              <UpcomingChargesCard charges={upcomingCharges} total={upcomingTotal} />
            </div>
          </div>

          {/* Bottom band — secondary, backward-looking (full trend on דוחות) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <TrendMiniChart months={trend} />
            <TopMerchantsCard merchants={topMerchants} />
          </div>
        </div>
      )}
    </div>
  );
}

/** The sections' loading state. */
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
      {/* Recent transactions skeleton */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={`sk-tx-${i}`} className="flex items-center justify-between px-1 py-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
