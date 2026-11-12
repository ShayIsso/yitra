"use client";

import * as React from "react";
import { monthKey } from "@/components/reports/format";
import { israelCalendarDay } from "@/lib/calendar";
import type { AccountBalance, RecentTransaction, TopMerchant } from "@/lib/analytics";
import type { MonthlyTargetsData } from "@/lib/budgets";
import type { Category } from "@/lib/categories";
import type { SyncRunSummary } from "@/lib/sync/runs";
import type { HomeMonth } from "../month";
import { AccountsSection } from "./accounts-section";
import { ACTIVITY_LIMIT, ActivitySection } from "./activity-section";
import { AttentionSection } from "./attention-section";
import { BudgetsSection, type BudgetsSummary } from "./budgets-section";
import { GoalsSection, type GoalsLadder } from "./goals-section";
import { ANY_MONTH, useSectionLoad } from "./load";
import { MerchantsSection } from "./merchants-section";
import { UpcomingSection, type UpcomingForecast } from "./upcoming-section";
import { anyRunSucceeded, onboardingFacts, type AttentionCounts } from "./view";

type BudgetsSummaryResponse = BudgetsSummary & { monthlyTargets: MonthlyTargetsData };

/**
 * The home sections under the trends (#321): budgets and goals, top
 * merchants, the attention list, upcoming recurring charges, accounts and the
 * activity feed. Each section reads its own endpoint and shows its own
 * skeleton, error and retry. Month-scoped reads (budgets, merchants) follow
 * the selected month; the rest describe today and survive a month change.
 *
 * Memoized: the home screen re-renders on every clock tick and sync-stream
 * frame. It loads as soon as it mounts but draws nothing until `visible` (the
 * home screen withholds it in a first-run state). `refreshKey` moves when the
 * data changed; a re-read keeps the old figures on screen.
 */
export const HomeSections = React.memo(function HomeSections({
  categories,
  month,
  refreshKey,
  visible,
  lastSyncRuns,
  onMonthlyTargets,
  today,
}: {
  categories: Category[];
  month: HomeMonth;
  refreshKey: string;
  visible: boolean;
  /** Last run per current institution; [] when that read failed (unknown, not "none"). */
  lastSyncRuns: SyncRunSummary[];
  /** Hands the monthly targets up once read, so the target dialog needn't read them again. */
  onMonthlyTargets: (targets: MonthlyTargetsData) => void;
  /**
   * The home calendar day from the home screen's clock (Asia/Jerusalem), so
   * day labels and the late flag roll over at midnight with the hero. Null
   * until that clock first reads; it changes once a day, so the memo holds.
   */
  today: string | null;
}) {
  const key = monthKey(month);
  const query = `year=${month.year}&month=${month.month}`;
  const budgets = useSectionLoad<BudgetsSummaryResponse>(
    `/api/budgets-summary?${query}`,
    key,
    refreshKey,
  );
  const merchants = useSectionLoad<TopMerchant[]>(
    `/api/analytics/top-merchants?${query}`,
    key,
    refreshKey,
  );
  const goals = useSectionLoad<GoalsLadder>("/api/goals", ANY_MONTH, refreshKey);
  const attention = useSectionLoad<AttentionCounts>("/api/attention-counts", ANY_MONTH, refreshKey);
  const upcoming = useSectionLoad<UpcomingForecast>(
    "/api/recurring-upcoming",
    ANY_MONTH,
    refreshKey,
  );
  const accounts = useSectionLoad<AccountBalance[]>(
    "/api/analytics/balances",
    ANY_MONTH,
    refreshKey,
  );
  const activity = useSectionLoad<RecentTransaction[]>(
    `/api/analytics/recent?limit=${ACTIVITY_LIMIT}`,
    ANY_MONTH,
    refreshKey,
  );

  // The targets are global, not per month: any month's answer is current.
  const monthlyTargets = budgets.last?.monthlyTargets ?? null;
  React.useEffect(() => {
    if (monthlyTargets) onMonthlyTargets(monthlyTargets);
  }, [monthlyTargets, onMonthlyTargets]);

  const categoriesById = React.useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  if (!visible) return null;
  // Client-only from here (the sections never draw on the server).
  const day = today ?? israelCalendarDay(new Date());
  // A failed balances read is a known unknown ([]), as the onboarding facts
  // expect; the next re-read tries it again.
  const balances = accounts.data ?? (accounts.failed ? [] : null);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <BudgetsSection load={budgets} categoriesById={categoriesById} />
          <GoalsSection load={goals} />
          <MerchantsSection load={merchants} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <AttentionSection
            load={attention}
            onboarding={onboardingFacts(attention.data, balances, lastSyncRuns)}
            expectOnboarding={!anyRunSucceeded(lastSyncRuns)}
          />
          <UpcomingSection load={upcoming} today={day} />
          <AccountsSection load={accounts} />
        </div>
      </div>
      <ActivitySection load={activity} today={day} categoriesById={categoriesById} />
    </div>
  );
});
