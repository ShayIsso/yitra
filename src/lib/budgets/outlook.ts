/**
 * The month outlook (#312 "Month outlook"): what's left of the month's expense
 * target, as of the last successful sync. Pure — no DB, no clock; `today` and
 * `now` are passed in like the rest of the pace core. The home screen renders
 * the returned state and never recomputes money.
 *
 * Spent follows the app's financial rules rather than restating them: totals
 * come from analytics' `computeMonthlySummary` (CONTEXT.md "net outflow"), so a
 * refund offsets spend, transfer/ignore are invisible and investment is not an
 * expense. On top of that the outlook drops two kinds of row a month-to-date
 * figure must not count: rows dated after `today` (scheduled and installment
 * rows the bank already lists) and the flagged settlement lump
 * (`excludeSettlementLumps`). Analytics applies that rule to per-category
 * figures only and keeps month totals type-driven; the outlook's spent is a
 * month total that applies it too (#328), because the hero must not read an
 * unreconciled bill lump as this month's spending. Pending rows count as
 * stored: the import's pending lifecycle already supersedes and sweeps them, so
 * a row beside a same-looking one is a repeat purchase.
 */
import {
  computeMonthlySummary,
  excludeSettlementLumps,
  outflowContribution,
  toAgorot,
  type AnalyticsTransaction,
  type ReconciliationRole,
} from "@/lib/analytics";
import { isMonthHistoryComplete } from "@/lib/analytics/history-coverage";
import { israelCalendarDay } from "@/lib/calendar";
import { isMonthClosed, monthElapsed, type YearMonth } from "./pace";
import { isSyncStale } from "./staleness";
import { THIN_HISTORY_MIN_FULL_MONTHS } from "./thin-history";

export { STALE_SYNC_AFTER_MS } from "./staleness";
export { THIN_HISTORY_MIN_FULL_MONTHS } from "./thin-history";

/** "Usual month" averages at most this many of the latest complete prior months. */
export const USUAL_MONTH_SPAN = 3;

/**
 * The projection leans on the usual month at the start of the month and on
 * this month's pace later: the history weight decays linearly to zero over
 * this many days (a few days of pace are noise).
 */
export const HISTORY_WEIGHT_DECAY_DAYS = 14;

/**
 * This month's pace is spread over at least this many days, so one large
 * purchase in the first days reads as a purchase, not a daily rate.
 */
export const PACE_MIN_DAYS = 7;

/**
 * Friendly rounding for the suggested target: the usual month rounded UP to
 * the first step whose ceiling it is under, so a usual month never reads as
 * over its own suggestion.
 */
export const SUGGESTED_TARGET_STEPS: readonly { below: number; step: number }[] = [
  { below: 1000, step: 100 },
  { below: 10000, step: 500 },
  { below: Infinity, step: 1000 },
];

export type OutlookRow = {
  id: string;
  /** YYYY-MM-DD, `transactions.date`. */
  date: string;
  description: string;
  chargedAmount: number;
  categoryType: AnalyticsTransaction["categoryType"];
  reconciliationRole: ReconciliationRole | null;
};

/** One live recurring series' charge for the month (CONTEXT.md "projected charge"). */
export type OutlookRecurringCharge = {
  id: string;
  /** Expected charge, positive shekels. */
  amount: number;
  /** YYYY-MM-DD: the projected date, or the observed one once it posted. */
  expectedDate: string;
  /** Posted this month as a row counted in spent. */
  arrived: boolean;
  /**
   * Posted this month, but as a row spent doesn't count yet (uncategorized):
   * still due, never late — the bill came, it just isn't categorized.
   */
  awaitingCategory: boolean;
  cadence: "monthly" | "quarterly" | "annual";
};

/** A prior month's expenses, computed by the same spend rules as the outlook month. */
export type PriorMonthExpenses = { month: YearMonth; expenses: number };

export type MonthOutlookInput = {
  month: YearMonth;
  /** YYYY-MM-DD, the budgets calendar-day convention. */
  today: string;
  /** The instant staleness is measured from. */
  now: Date;
  /** The monthly expense target; a suggestion is never passed in here. */
  target: number | null;
  /** Every stored row dated inside `month`, any category type and status. */
  rows: OutlookRow[];
  recurring: OutlookRecurringCharge[];
  history: PriorMonthExpenses[];
  /**
   * YYYY-MM-DD from which every current account's data is present: the latest
   * of the accounts' earliest transactions. A prior month is complete only
   * when this reaches back to its first day.
   */
  historyCompleteSince: string | null;
  lastSuccessfulSyncAt: Date | null;
  credentialCount: number;
  sync: { running: boolean; banksDone: number };
};

export type SyncProgress = { running: boolean; banksDone: number; banksTotal: number };

export type DueRecurringCharge = OutlookRecurringCharge & {
  /** Its expected date has passed and it hasn't posted: still owed, any day. */
  late: boolean;
};

export type ProjectionBasis = "usual-month" | "this-month-pace";

export type Projection = {
  /** Where the month lands: spent + projected variable spend + recurring still due. */
  total: number;
  /** Cumulative net spend, index 0 = day 1, through today. */
  actual: number[];
  /** Cumulative projected spend, index 0 = today, through the month's last day. */
  projected: number[];
};

export type MonthOutlook =
  | { state: "no-connection" }
  | { state: "first-sync"; progress: SyncProgress }
  | {
      state: "no-target";
      spent: number;
      /**
       * Nullable per the #312 contract; `monthOutlook` itself answers thin
       * history with `thin-history`, so it returns these non-null.
       */
      usualMonth: number | null;
      /** Only ever a suggestion: confirming it goes through the monthly-targets write path. */
      suggestedTarget: number | null;
      asOf: Date;
      stale: boolean;
    }
  | { state: "thin-history"; spent: number; asOf: Date; stale: boolean }
  | {
      state: "active";
      target: number;
      spent: number;
      dueRecurring: number;
      dueCharges: DueRecurringCharge[];
      /** target − spent − due. Negative when over: never clamped to zero. */
      remaining: number;
      /** Days left including today. */
      daysLeft: number;
      /** max(remaining, 0) ÷ daysLeft. */
      perDay: number;
      /** −remaining when over target, else null. */
      overBy: number | null;
      /** Null when history is thin. */
      projection: Projection | null;
      /**
       * YYYY-MM-DD of the first day the projection exceeds the target; null when
       * it doesn't, and null whenever `overBy` is set.
       */
      crossingDate: string | null;
      /**
       * Which side contributes more to the projected variable spend — the usual
       * month's rate or this month's pace; null with no projection.
       */
      projectionBasis: ProjectionBasis | null;
      asOf: Date;
      stale: boolean;
    }
  | {
      state: "closed";
      income: number;
      expenses: number;
      net: number;
      target: number | null;
      overBy: number | null;
      /** A closed month still stands on the last sync: its rows can arrive days late. */
      asOf: Date;
      stale: boolean;
    };

/**
 * Whether `month` has begun on the home calendar day (`israelCalendarDay`) —
 * the outlook's precondition.
 */
export function hasOutlookMonthStarted(month: YearMonth, now: Date): boolean {
  return monthElapsed(month, israelCalendarDay(now)).dayOfMonth > 0;
}

const dayOf = (isoDate: string): number => Number(isoDate.slice(8, 10));

function monthKey(month: YearMonth): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}

function isoDay(month: YearMonth, day: number): string {
  return `${monthKey(month)}-${String(day).padStart(2, "0")}`;
}

/**
 * The month's rows that count, through `throughDate` inclusive: inside the
 * month, not future-dated, and not the flagged settlement lump.
 */
function countedRows(rows: readonly OutlookRow[], month: YearMonth, throughDate: string) {
  const prefix = `${monthKey(month)}-`;
  return excludeSettlementLumps(rows).filter(
    (r) => r.date.startsWith(prefix) && r.date <= throughDate,
  );
}

/**
 * Ids of the month's rows that add to spend: expense-typed and not the flagged
 * lump. A recurring series has arrived only through one of these.
 */
export function spendRowIds(rows: readonly OutlookRow[]): Set<string> {
  return new Set(
    excludeSettlementLumps(rows)
      .filter((r) => r.categoryType === "expense")
      .map((r) => r.id),
  );
}

/** A whole month by the outlook's rules. */
function wholeMonthSummary(rows: readonly OutlookRow[], month: YearMonth) {
  const { daysInMonth } = monthElapsed(month, isoDay(month, 1));
  return computeMonthlySummary(countedRows(rows, month, isoDay(month, daysInMonth)));
}

/**
 * A month's expenses by the outlook's rules — what the DB wrapper reports as a
 * prior month's history, so the usual month and this month's spend agree.
 */
export function outlookMonthExpenses(rows: readonly OutlookRow[], month: YearMonth): number {
  return wholeMonthSummary(rows, month).expenses;
}

const ordinal = (month: YearMonth): number => month.year * 12 + month.month;

/** Mean of the latest complete prior months with expense data, or null when history is thin. */
function usualMonthOf(input: MonthOutlookInput): number | null {
  const full = input.history
    .filter((h) => ordinal(h.month) < ordinal(input.month))
    .filter((h) => h.expenses > 0 && isMonthHistoryComplete(h.month, input.historyCompleteSince))
    .sort((a, b) => ordinal(b.month) - ordinal(a.month));
  if (full.length < THIN_HISTORY_MIN_FULL_MONTHS) return null;
  const used = full.slice(0, USUAL_MONTH_SPAN);
  return toAgorot(used.reduce((sum, h) => sum + h.expenses, 0) / used.length);
}

function suggestTarget(usualMonth: number): number {
  const { step } = SUGGESTED_TARGET_STEPS.find((s) => usualMonth < s.below)!;
  return Math.max(step, Math.ceil(usualMonth / step) * step);
}

function dailyNetExpense(rows: readonly OutlookRow[], days: number): number[] {
  const daily = new Array<number>(days).fill(0);
  for (const r of rows) {
    if (r.categoryType !== "expense") continue;
    const d = dayOf(r.date);
    if (d >= 1 && d <= days) daily[d - 1] += outflowContribution(r.chargedAmount);
  }
  return daily;
}

function project(args: {
  counted: OutlookRow[];
  spent: number;
  usualMonth: number;
  recurring: readonly OutlookRecurringCharge[];
  dueCharges: readonly DueRecurringCharge[];
  today: string;
  day: number;
  daysInMonth: number;
}): { projection: Projection; basis: ProjectionBasis } {
  const { counted, spent, usualMonth, recurring, dueCharges, today, day, daysInMonth } = args;

  let cum = 0;
  const actual = dailyNetExpense(counted, day).map((amount) => toAgorot((cum += amount)));

  // Recurring charges are placed on their own dates, so both rates are of
  // variable spend only — rent on day 1 must not be extrapolated across the
  // month. A usual month holds every monthly series once but a quarterly or
  // annual one only now and then, so history sheds monthly charges only.
  const arrived = recurring.filter((c) => c.arrived).reduce((sum, c) => sum + c.amount, 0);
  const monthlyRecurring = recurring
    .filter((c) => c.cadence === "monthly")
    .reduce((sum, c) => sum + c.amount, 0);
  const paceRate = Math.max(0, spent - arrived) / Math.max(day, PACE_MIN_DAYS);
  const historyRate = Math.max(0, usualMonth - monthlyRecurring) / daysInMonth;
  const historyWeight = Math.max(0, 1 - day / HISTORY_WEIGHT_DECAY_DAYS);
  const historyPart = historyWeight * historyRate;
  const pacePart = (1 - historyWeight) * paceRate;
  const rate = historyPart + pacePart;
  const basis: ProjectionBasis =
    pacePart > historyPart || (pacePart === historyPart && historyWeight <= 0.5)
      ? "this-month-pace"
      : "usual-month";

  // A charge expected today or earlier — late, possibly since last month —
  // lands on the next day; on the month's last day there is no next day, so it
  // lands today. Due charges never fall after the month (`monthOutlook` filters
  // them), so a later date is a day of this month.
  const landing = new Map<number, number>();
  for (const c of dueCharges) {
    const expected = c.expectedDate <= today ? day + 1 : dayOf(c.expectedDate);
    const landDay = Math.min(daysInMonth, expected);
    landing.set(landDay, (landing.get(landDay) ?? 0) + c.amount);
  }

  let running = spent + (landing.get(day) ?? 0);
  const projected = [toAgorot(running)];
  for (let d = day + 1; d <= daysInMonth; d++) {
    running += rate + (landing.get(d) ?? 0);
    projected.push(toAgorot(running));
  }

  return {
    projection: { total: projected[projected.length - 1], actual, projected },
    basis,
  };
}

/**
 * Null once the month is already committed over target (`overBy` is set):
 * spent plus what's due exceeds it whatever the variable pace does, so a
 * crossing date would only restate the overage.
 */
function crossingDateOf(
  projected: readonly number[],
  remaining: number,
  target: number,
  month: YearMonth,
  day: number,
): string | null {
  if (remaining < 0) return null;
  const index = projected.findIndex((cum) => cum > target);
  return index === -1 ? null : isoDay(month, day + index);
}

export function monthOutlook(input: MonthOutlookInput): MonthOutlook {
  if (input.credentialCount === 0) return { state: "no-connection" };
  if (input.lastSuccessfulSyncAt === null) {
    return {
      state: "first-sync",
      progress: { ...input.sync, banksTotal: input.credentialCount },
    };
  }

  const { month, today, target } = input;
  const asOf = input.lastSuccessfulSyncAt;
  const stale = isSyncStale(input.now.getTime() - asOf.getTime());

  if (isMonthClosed(month, today)) {
    const summary = wholeMonthSummary(input.rows, month);
    return {
      state: "closed",
      income: toAgorot(summary.income),
      expenses: summary.expenses,
      net: toAgorot(summary.netSavings),
      target,
      overBy:
        target !== null && summary.expenses > target ? toAgorot(summary.expenses - target) : null,
      asOf,
      stale,
    };
  }

  const elapsed = monthElapsed(month, today);
  if (elapsed.dayOfMonth === 0) {
    throw new RangeError("monthOutlook: the month has not started yet");
  }

  const counted = countedRows(input.rows, month, today);
  const spent = computeMonthlySummary(counted).expenses;
  const usualMonth = usualMonthOf(input);

  if (target === null) {
    if (usualMonth === null) return { state: "thin-history", spent, asOf, stale };
    return {
      state: "no-target",
      spent,
      usualMonth,
      suggestedTarget: suggestTarget(usualMonth),
      asOf,
      stale,
    };
  }

  const monthEnd = isoDay(month, elapsed.daysInMonth);
  const dueCharges = input.recurring
    .filter((c) => !c.arrived && c.expectedDate <= monthEnd)
    .map((c) => ({ ...c, late: !c.awaitingCategory && c.expectedDate < today }));
  const dueRecurring = toAgorot(dueCharges.reduce((sum, c) => sum + c.amount, 0));

  const remaining = toAgorot(target - spent - dueRecurring);
  const daysLeft = elapsed.daysInMonth - elapsed.dayOfMonth + 1;

  const projected =
    usualMonth === null
      ? null
      : project({
          counted,
          spent,
          usualMonth,
          recurring: input.recurring.filter((c) => c.arrived || c.expectedDate <= monthEnd),
          dueCharges,
          today,
          day: elapsed.dayOfMonth,
          daysInMonth: elapsed.daysInMonth,
        });

  return {
    state: "active",
    target,
    spent,
    dueRecurring,
    dueCharges,
    remaining,
    daysLeft,
    perDay: toAgorot(Math.max(0, remaining) / daysLeft),
    overBy: remaining < 0 ? toAgorot(-remaining) : null,
    projection: projected?.projection ?? null,
    crossingDate: projected
      ? crossingDateOf(projected.projection.projected, remaining, target, month, elapsed.dayOfMonth)
      : null,
    projectionBasis: projected?.basis ?? null,
    asOf,
    stale,
  };
}
