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

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * The home screen's insights aggregate (#313): one request composing the
 * existing analytics, budgets, recurring and attention reads server-side, so
 * the client never stitches insights together from paged transaction reads.
 * Returns the reduced facts and the selected, ordered insight cards.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { year, month } = querySchema.parse(Object.fromEntries(searchParams));
    const now = new Date();
    // UTC calendar date, the same "today" the budgets pace and next-debit reads use.
    const today = toIsoDate(now);
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

    const { upcoming } = projectUpcomingCharges(patterns, recentTxns, now);

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
        cadence: charge.cadence,
      })),
      expenseTarget,
    });

    return NextResponse.json({ facts, insights: selectInsights(facts) });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
