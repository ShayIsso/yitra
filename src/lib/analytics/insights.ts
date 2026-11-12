/**
 * Insight selection: which home-screen insight cards show for a month, in what
 * order, plus the day-of-month gating rules the home sections share. Pure and
 * dependency-free (no DB, no `new Date()`), like `month-window`, so client
 * components can import the gating rules from this file directly. The facts it
 * selects from are reduced server-side by `buildInsightFacts` (analytics index).
 * Client code must import values from `@/lib/analytics/insights`, never from
 * `@/lib/analytics`, whose index pulls the DB client into the bundle.
 */
import type { Cadence } from "@/lib/recurring-detection";
import { toAgorot } from "./agorot";
import { monthDateRange } from "./month-window";

export type InsightMonth = { year: number; month: number };

export function previousMonth({ year, month }: InsightMonth): InsightMonth {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

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
  /**
   * YYYY-MM-DD. In facts, the recurring module's projection; in an
   * `upcoming-recurring` insight, the calendar due date. Before `today` when the
   * series is late but still live.
   */
  date: string;
  /** YYYY-MM-DD of the series' last observed charge. */
  lastChargeDate: string;
  cadence: Cadence;
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

/**
 * One whole month's story. Its totals are the Dashboard's month totals (type
 * driven, so they agree with every other surface); its category, day and
 * biggest-expense figures leave the settlement lump out by shape.
 */
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
  /** The live monthly series as of today — what recurring charges take each month now. */
  recurring: { count: number; monthlyTotal: number };
  /**
   * Month expenses against the current expense target (no target history is
   * kept — the same simplification month-close verdicts make). Null when no
   * target is set.
   */
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
    total: toAgorot(cards.reduce((sum, c) => sum + c.amount, 0)),
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

/** Descending. Compares rather than subtracts, so it never returns NaN for two zero-limit (`Infinity`) budgets. */
function bySpentFractionDesc(a: BudgetFact, b: BudgetFact): number {
  const fa = spentFraction(a);
  const fb = spentFraction(b);
  return fa === fb ? 0 : fa > fb ? -1 : 1;
}

function budgetRiskInsight(budgets: BudgetFact[]): Insight | null {
  const atRisk = budgets
    .filter((b) => b.verdict === "over" || b.verdict === "at-risk")
    .sort(
      (a, b) =>
        Number(b.verdict === "over") - Number(a.verdict === "over") || bySpentFractionDesc(a, b),
    );
  if (atRisk.length === 0) return null;
  return { kind: "budget-risk", budgets: atRisk };
}

const CADENCE_MONTHS: Record<Cadence, number> = { monthly: 1, quarterly: 3, annual: 12 };

/** `isoDate` plus whole calendar months, the day clamped to the target month's length. */
function addCalendarMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const { to } = monthDateRange(year, month);
  const day = Math.min(d, Number(to.slice(8, 10)));
  return `${to.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

/**
 * Which month a bill belongs to is a calendar fact: the next charge is the last
 * one plus the cadence in calendar months. The recurring module's projection
 * (last charge + 30/91/365 days) drifts across month ends: a charge on the 1st
 * of a 31-day month projects onto the 31st although it is already paid, one on
 * Jan 31 projects to Mar 2 although it is February's bill. A series is due this
 * month when it has not charged in it yet and its calendar due date is no later
 * than month end — earlier means late but still live, so still owed. The card
 * shows that calendar due date.
 */
function upcomingRecurringInsight(
  month: InsightMonth,
  charges: RecurringChargeFact[],
): Insight | null {
  const { from, to } = monthDateRange(month.year, month.month);
  const due = charges
    .filter((c) => c.lastChargeDate < from)
    .map((c) => ({ ...c, date: addCalendarMonths(c.lastChargeDate, CADENCE_MONTHS[c.cadence]) }))
    .filter((c) => c.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (due.length === 0) return null;
  return {
    kind: "upcoming-recurring",
    total: toAgorot(due.reduce((sum, c) => sum + c.amount, 0)),
    charges: due,
  };
}

/**
 * Smallest rise that counts as a jump. A category new this month (no spend last
 * month) is not a jump: there is no baseline to have jumped from.
 */
export const CATEGORY_JUMP_MIN_INCREASE = 100;

function categoryJumpInsight(changes: CategoryChangeFact[]): Insight | null {
  let jump: { fact: CategoryChangeFact; change: number } | null = null;
  for (const fact of changes) {
    const change = toAgorot(fact.amount - fact.previous);
    if (fact.previous <= 0 || change < CATEGORY_JUMP_MIN_INCREASE) continue;
    if (!jump || change > jump.change) jump = { fact, change };
  }
  if (!jump) return null;
  return { kind: "category-jump", ...jump.fact, change: jump.change };
}

/**
 * The insight cards for a month, ordered by actionability: the upcoming card
 * debit (the one dated, unavoidable outflow) always leads, items waiting on the
 * user follow, then risk, the rest of the month's commitments, anomalies, and
 * the month recap always last. Cards about the future (card debit, budget
 * risk, upcoming recurring) exist only while the month is current, and a month
 * that has not started shows nothing.
 */
export function selectInsights(facts: InsightFacts): Insight[] {
  const phase = monthPosition(facts.month, facts.today).phase;
  if (phase === "not-started") return [];
  const current = phase === "current";
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
