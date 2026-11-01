/**
 * Insight selection: which home-screen insight cards show for a month, in what
 * order, plus the day-of-month gating rules the home sections share. Pure and
 * dependency-free (no DB, no `new Date()`), like `month-window`, so client
 * components can import the gating rules from this file directly. The facts it
 * selects from are reduced server-side by `buildInsightFacts` (analytics index).
 */
import { monthDateRange } from "./month-window";

export type InsightMonth = { year: number; month: number };

/** An upcoming card-account debit, from the account's next-debit estimate. */
export type CardDebitFact = {
  accountId: string;
  displayName: string;
  /** Positive: the amount the debit will take. */
  amount: number;
  /** YYYY-MM-DD. */
  date: string;
};

export type BudgetFact = {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  verdict: "over" | "at-risk" | "on-pace" | "comfortably-under";
  spent: number;
  limit: number;
};

export type RecurringChargeFact = {
  id: string;
  name: string;
  /** Positive expected charge. */
  amount: number;
  /** YYYY-MM-DD; before `today` when the series is late but still live. */
  date: string;
};

/**
 * A top-level category (group or root leaf) under the spend floor, against the
 * previous month over the same window (month-to-date for the current month).
 */
export type CategoryChangeFact = {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  amount: number;
  previous: number;
};

export type BiggestExpenseFact = {
  transactionId: string;
  description: string;
  /** Positive outflow. */
  amount: number;
  date: string;
  categoryId: string | null;
  categoryName: string | null;
};

export type RecapFact = {
  month: InsightMonth;
  income: number;
  expenses: number;
  netSavings: number;
  /** Null when income is not positive — a rate over nothing is not a figure. */
  savingsRate: number | null;
  topCategory: {
    categoryId: string;
    name: string;
    color: string;
    amount: number;
    share: number;
  } | null;
  biggestChange: { categoryId: string; name: string; amount: number; previous: number } | null;
  mostExpensiveDay: { date: string; amount: number; topDescription: string | null } | null;
  recurring: { count: number; monthlyTotal: number };
  /** Null when no expense target is set. */
  verdict: { target: number; over: boolean; by: number } | null;
};

/** Everything insight selection needs for one month — the insights aggregate. */
export type InsightFacts = {
  month: InsightMonth;
  /** YYYY-MM-DD. */
  today: string;
  cardDebits: CardDebitFact[];
  attention: { uncategorized: number; needsReview: number };
  budgets: BudgetFact[];
  upcomingRecurring: RecurringChargeFact[];
  categoryChanges: CategoryChangeFact[];
  biggestExpense: BiggestExpenseFact | null;
  recap: RecapFact | null;
};

export type Insight =
  | { kind: "card-debit"; total: number; date: string; cards: CardDebitFact[] }
  | { kind: "uncategorized"; count: number }
  | { kind: "needs-review"; count: number }
  | { kind: "budget-risk"; budgets: BudgetFact[] }
  | { kind: "upcoming-recurring"; total: number; charges: RecurringChargeFact[] }
  | ({ kind: "category-jump"; change: number } & CategoryChangeFact)
  | ({ kind: "biggest-expense" } & BiggestExpenseFact)
  | ({ kind: "recap" } & RecapFact);

export type InsightKind = Insight["kind"];

/**
 * Early in a month bank data lags (transactions land days late), so
 * month-over-month deltas and "nothing yet on X" mostly measure reporting delay,
 * not behaviour. These are the first days of the current month each one shows.
 */
export const MONTH_OVER_MONTH_VISIBLE_FROM_DAY = 7;
export const QUIET_CATEGORIES_VISIBLE_FROM_DAY = 11;

export type MonthPosition =
  | { phase: "not-started" }
  | { phase: "current"; day: number }
  | { phase: "closed" };

/** Where `today` (YYYY-MM-DD) stands relative to `month`; `day` is today's day of the month. */
export function monthPosition(month: InsightMonth, today: string): MonthPosition {
  const [ty, tm, td] = today.split("-").map(Number);
  const todayIndex = ty * 12 + tm;
  const monthIndex = month.year * 12 + month.month;
  if (todayIndex < monthIndex) return { phase: "not-started" };
  if (todayIndex > monthIndex) return { phase: "closed" };
  return { phase: "current", day: td };
}

function visibleFromDay(month: InsightMonth, today: string, fromDay: number): boolean {
  const position = monthPosition(month, today);
  if (position.phase === "current") return position.day >= fromDay;
  return position.phase === "closed";
}

/** Whether month-over-month change is shown for `month` as of `today` (YYYY-MM-DD). */
export function isMonthOverMonthChangeVisible(month: InsightMonth, today: string): boolean {
  return visibleFromDay(month, today, MONTH_OVER_MONTH_VISIBLE_FROM_DAY);
}

/**
 * Whether categories that had spend last month but none yet in `month` are
 * listed, as of `today` (YYYY-MM-DD).
 */
export function areQuietCategoriesVisible(month: InsightMonth, today: string): boolean {
  return visibleFromDay(month, today, QUIET_CATEGORIES_VISIBLE_FROM_DAY);
}

function cardDebitInsight(debits: CardDebitFact[]): Insight | null {
  if (debits.length === 0) return null;
  const cards = [...debits].sort((a, b) => a.date.localeCompare(b.date));
  return {
    kind: "card-debit",
    total: cards.reduce((sum, c) => sum + c.amount, 0),
    date: cards[0].date,
    cards,
  };
}

function countInsight(kind: "uncategorized" | "needs-review", count: number): Insight | null {
  return count > 0 ? { kind, count } : null;
}

function spentFraction(b: BudgetFact): number {
  if (b.limit > 0) return b.spent / b.limit;
  return b.spent > 0 ? Infinity : 0;
}

function budgetRiskInsight(budgets: BudgetFact[]): Insight | null {
  const atRisk = budgets
    .filter((b) => b.verdict === "over" || b.verdict === "at-risk")
    .sort(
      (a, b) =>
        Number(b.verdict === "over") - Number(a.verdict === "over") ||
        spentFraction(b) - spentFraction(a),
    );
  if (atRisk.length === 0) return null;
  return { kind: "budget-risk", budgets: atRisk };
}

/**
 * A live series' projection dated before today is late, not gone — it is still
 * owed, so it stays in the card alongside the rest of the month's charges.
 */
function upcomingRecurringInsight(
  month: InsightMonth,
  charges: RecurringChargeFact[],
): Insight | null {
  const { to } = monthDateRange(month.year, month.month);
  const due = charges.filter((c) => c.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  if (due.length === 0) return null;
  return {
    kind: "upcoming-recurring",
    total: due.reduce((sum, c) => sum + c.amount, 0),
    charges: due,
  };
}

/**
 * Smallest rise that counts as a jump. A category new this month (no spend last
 * month) is not a jump: there is no baseline to have jumped from.
 */
export const CATEGORY_JUMP_MIN_INCREASE = 100;

function categoryJumpInsight(changes: CategoryChangeFact[]): Insight | null {
  let jump: CategoryChangeFact | null = null;
  for (const c of changes) {
    if (c.previous <= 0 || c.amount - c.previous < CATEGORY_JUMP_MIN_INCREASE) continue;
    if (!jump || c.amount - c.previous > jump.amount - jump.previous) jump = c;
  }
  if (!jump) return null;
  return { kind: "category-jump", ...jump, change: jump.amount - jump.previous };
}

/**
 * The insight cards for a month, ordered by actionability: the upcoming card
 * debit (the one dated, unavoidable outflow) always leads, items waiting on the
 * user follow, then risk, the rest of the month's commitments, anomalies, and
 * the month recap always last. Cards about the future (card debit, budget
 * risk, upcoming recurring) exist only while the month is current.
 */
export function selectInsights(facts: InsightFacts): Insight[] {
  const current = monthPosition(facts.month, facts.today).phase === "current";
  const candidates: (Insight | null)[] = [
    current ? cardDebitInsight(facts.cardDebits) : null,
    countInsight("uncategorized", facts.attention.uncategorized),
    countInsight("needs-review", facts.attention.needsReview),
    current ? budgetRiskInsight(facts.budgets) : null,
    current ? upcomingRecurringInsight(facts.month, facts.upcomingRecurring) : null,
    isMonthOverMonthChangeVisible(facts.month, facts.today)
      ? categoryJumpInsight(facts.categoryChanges)
      : null,
    facts.biggestExpense ? { kind: "biggest-expense", ...facts.biggestExpense } : null,
    facts.recap ? { kind: "recap", ...facts.recap } : null,
  ];
  return candidates.filter((i): i is Insight => i !== null);
}
