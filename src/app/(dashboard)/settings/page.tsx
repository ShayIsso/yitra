export const dynamic = "force-dynamic";

import { getCategories, getCategoryTree } from "@/lib/categories";
import { getRules } from "@/lib/categories/rules";
import { listGoals, getGoalLadder } from "@/lib/goals";
import { listBudgets, getMonthlyTargets } from "@/lib/budgets";
import { listCredentials } from "@/lib/credentials";
import { readProviderSettings } from "@/lib/ai-categorization";
import { getSchedulerConfigAction } from "@/app/actions/scheduler";
import { CategoriesSection } from "@/components/categories-section";
import { CredentialsSection } from "@/components/credentials-section";
import { RulesSection } from "@/components/rules-section";
import { SchedulerSection } from "@/components/scheduler-section";
import { ProviderSection } from "@/components/provider-section";
import { GoalsSection } from "@/components/goals-section";
import { BudgetsSection } from "@/components/budgets-section";
import { MonthlyTargetsSection } from "@/components/settings/monthly-targets-section";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { SettingsLayout, type SectionSummary } from "@/components/settings/settings-layout";
import { SectionLoadError } from "@/components/settings/parts";
import {
  countSummary,
  providerSummary,
  schedulerSummary,
  type SettingsSection,
} from "@/components/settings/sections";

type Loaded<T> = { ok: true; data: T } | { ok: false };

/**
 * One section's data failing must not blank the page (spec #312 story 43): each
 * read settles on its own and a failed one renders that section's inline error
 * with a retry. Nothing is logged: a database error can carry query text, and
 * the credential read sits among these.
 */
async function settle<T>(read: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await read };
  } catch {
    return { ok: false };
  }
}

export default async function SettingsPage() {
  const [
    credentials,
    categories,
    categoryTree,
    rules,
    schedulerConfig,
    goals,
    ladder,
    budgets,
    monthlyTargets,
    providerSettings,
  ] = await Promise.all([
    settle(listCredentials()),
    settle(getCategories()),
    settle(getCategoryTree()),
    settle(getRules()),
    settle(getSchedulerConfigAction()),
    settle(listGoals()),
    settle(getGoalLadder()),
    settle(listBudgets()),
    settle(getMonthlyTargets()),
    settle(readProviderSettings()),
  ]);

  const panes: Record<SettingsSection, React.ReactNode> = {
    accounts: credentials.ok ? (
      <CredentialsSection
        initialCredentials={credentials.data.map((c) => ({
          id: c.id,
          bankType: c.bankType,
          displayName: c.displayName,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    ) : (
      <SectionLoadError section="accounts" />
    ),
    categories: categories.ok ? (
      <CategoriesSection initialCategories={categories.data} />
    ) : (
      <SectionLoadError section="categories" />
    ),
    rules:
      rules.ok && categories.ok && categoryTree.ok ? (
        <RulesSection
          initialRules={rules.data}
          categories={categories.data}
          tree={categoryTree.data}
        />
      ) : (
        <SectionLoadError section="rules" />
      ),
    ai: providerSettings.ok ? (
      <ProviderSection initial={providerSettings.data} />
    ) : (
      <SectionLoadError section="ai" />
    ),
    targets: monthlyTargets.ok ? (
      <MonthlyTargetsSection initialTargets={monthlyTargets.data} />
    ) : (
      <SectionLoadError section="targets" />
    ),
    budgets:
      budgets.ok && categories.ok ? (
        <BudgetsSection initialBudgets={budgets.data} categories={categories.data} />
      ) : (
        <SectionLoadError section="budgets" />
      ),
    goals:
      goals.ok && ladder.ok ? (
        <GoalsSection
          initialGoals={goals.data}
          ladderStatus={ladder.data.rungs.map((rung) => ({
            id: rung.goal.id,
            current: rung.current,
            target: rung.target,
            paceVerdict: rung.paceVerdict,
          }))}
          initialTrackingSince={ladder.data.trackingSinceMonth}
        />
      ) : (
        <SectionLoadError section="goals" />
      ),
    scheduler: schedulerConfig.ok ? (
      <SchedulerSection initialConfig={schedulerConfig.data} />
    ) : (
      <SectionLoadError section="scheduler" />
    ),
    appearance: <AppearanceSection />,
  };

  const summaries: Partial<Record<SettingsSection, SectionSummary>> = {};
  const text = (value: string): SectionSummary => ({ kind: "text", text: value });
  if (credentials.ok) summaries.accounts = text(countSummary("accounts", credentials.data.length));
  if (categories.ok) {
    summaries.categories = text(countSummary("categories", categories.data.length));
  }
  if (rules.ok) summaries.rules = text(countSummary("rules", rules.data.length));
  if (providerSettings.ok) {
    const { effective, environmentProvider } = providerSettings.data;
    summaries.ai = text(providerSummary(effective, environmentProvider !== null));
  }
  if (monthlyTargets.ok) {
    const { expenseTarget } = monthlyTargets.data;
    summaries.targets =
      expenseTarget === null
        ? text("לא הוגדר יעד")
        : { kind: "amount", amount: expenseTarget, suffix: "לחודש" };
  }
  if (budgets.ok) summaries.budgets = text(countSummary("budgets", budgets.data.length));
  if (goals.ok) {
    const active = goals.data.filter((g) => g.archivedAt == null).length;
    summaries.goals = text(countSummary("goals", active));
  }
  if (schedulerConfig.ok) summaries.scheduler = text(schedulerSummary(schedulerConfig.data));

  return <SettingsLayout panes={panes} summaries={summaries} />;
}
