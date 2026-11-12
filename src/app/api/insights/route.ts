import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  buildInsightFacts,
  getAccountBalances,
  getMonthTransactionDetails,
  getRollupCategories,
  previousMonth,
  selectInsights,
} from "@/lib/analytics";
import { getBudgetStatuses, getMonthlyTargets } from "@/lib/budgets";
import { drizzleRecurringStore, projectUpcomingCharges } from "@/lib/recurring-detection";
import { getUncategorizedTransactionCount } from "@/lib/transactions";
import { createReviewStore } from "@/lib/ai-categorization";
import { formatZodError } from "@/lib/api-utils";
import { israelCalendarDay } from "@/lib/calendar";

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * The home screen's insights aggregate (#313): one request composing the
 * existing analytics, budgets, recurring and attention reads server-side, so
 * the client never stitches insights together from paged transaction reads.
 * Returns the selected, ordered insight cards and the day they were judged on;
 * the recap card carries its whole fact, so the reduced facts stay server-side.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { year, month } = querySchema.parse(Object.fromEntries(searchParams));
    const now = new Date();
    // The home calendar day, the same "today" the month outlook uses; the
    // budget pace read below takes it explicitly so both agree.
    const today = israelCalendarDay(now);
    const previous = previousMonth({ year, month });
    const beforePrevious = previousMonth(previous);

    const [
      monthRows,
      previousRows,
      beforePreviousRows,
      categories,
      balances,
      budgetStatuses,
      { expenseTarget },
      patterns,
      recentTxns,
      uncategorized,
      needsReview,
    ] = await Promise.all([
      getMonthTransactionDetails(year, month),
      getMonthTransactionDetails(previous.year, previous.month),
      getMonthTransactionDetails(beforePrevious.year, beforePrevious.month),
      getRollupCategories(),
      getAccountBalances(),
      getBudgetStatuses(year, month, today),
      getMonthlyTargets(),
      drizzleRecurringStore.getPersistedPatterns(),
      drizzleRecurringStore.getTransactionsForDetection(),
      getUncategorizedTransactionCount(),
      createReviewStore().getPendingSuggestionCount(),
    ]);

    // Liveness on the same day the facts are judged on, as the month outlook does.
    const { upcoming } = projectUpcomingCharges(
      patterns,
      recentTxns,
      new Date(`${today}T00:00:00.000Z`),
    );

    const facts = buildInsightFacts({
      month: { year, month },
      today,
      rows: { month: monthRows, previous: previousRows, beforePrevious: beforePreviousRows },
      categories,
      balances,
      attention: { uncategorized, needsReview },
      budgets: budgetStatuses.map(({ budget, pace }) => ({
        budgetId: budget.id,
        categoryId: budget.categoryId,
        verdict: pace.verdict,
        spent: pace.spent,
        limit: pace.limit,
      })),
      upcoming: upcoming.map((charge) => ({
        id: charge.patternId,
        name: charge.displayName ?? charge.merchant,
        amount: charge.expectedAmount,
        date: toIsoDate(charge.projectedDate),
        lastChargeDate: toIsoDate(charge.lastObservedChargeDate),
        cadence: charge.cadence,
      })),
      expenseTarget,
    });

    return NextResponse.json({ today: facts.today, insights: selectInsights(facts) });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
