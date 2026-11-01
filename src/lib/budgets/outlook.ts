/**
 * The month outlook (#312 "Month outlook"): what's left of the month's expense
 * target, as of the last successful sync. Pure — no DB, no clock; `today` and
 * `now` are passed in like the rest of the pace core. The home screen renders
 * the returned state and never recomputes money.
 *
 * Spent follows the app's financial rules rather than restating them: totals
 * come from analytics' `computeMonthlySummary` (CONTEXT.md "net outflow"), so a
 * refund offsets spend, transfer/ignore are invisible and investment is not an
 * expense. On top of that the outlook drops three kinds of row a month-to-date
 * figure must not count: rows dated after `today` (scheduled and installment
 * rows the bank already lists), a settlement charge not yet reconciled to
 * `transfer` (reconciliation's lump shape), and a pending row whose exact
 * completed twin is already stored (CONTEXT.md "pending lifecycle").
 */
import {
  computeMonthlySummary,
  outflowContribution,
  type AnalyticsTransaction,
} from "@/lib/analytics";
import { isBankLumpCandidate } from "@/lib/reconciliation";
import { pendingWithCompletedTwin } from "@/lib/transactions";
import { isMonthClosed, monthElapsed, type YearMonth } from "./pace";

/**
 * Last successful sync older than this makes the outlook stale (#312 "stale =
 * last successful sync older than 2 days").
 */
export const STALE_SYNC_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * History is thin below this many complete prior months with expense data: no
 * "usual month", no suggested target, no projection. A month counts as
 * complete only when stored data reaches back to its first day — a partial
 * month would understate the usual month.
 */
export const THIN_HISTORY_MIN_FULL_MONTHS = 1;

/** "Usual month" averages at most this many of the latest complete prior months. */
export const USUAL_MONTH_SPAN = 3;

/**
 * The projection leans on the usual month at the start of the month and on
 * this month's pace later: the history weight decays linearly to zero over
 * this many days (a few days of pace are noise).
 */
export const HISTORY_WEIGHT_DECAY_DAYS = 14;

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
  bankAccountId: string;
  /** Institution id; its registry kind decides whether the row can be a settlement charge. */
  bankType: string;
  /** YYYY-MM-DD, `transactions.date`. */
  date: string;
  description: string;
  chargedAmount: number;
  status: "pending" | "completed";
  categoryType: AnalyticsTransaction["categoryType"];
};

/** One live recurring series' charge for the month (CONTEXT.md "projected charge"). */
export type OutlookRecurringCharge = {
  id: string;
  /** Expected charge, positive shekels. */
  amount: number;
  /** YYYY-MM-DD: the projected date, or the observed one once it arrived. */
  expectedDate: string;
  arrived: boolean;
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
  /** YYYY-MM-DD of the earliest stored transaction: how far back history is complete. */
  dataSince: string | null;
  lastSuccessfulSyncAt: Date | null;
  credentialCount: number;
  sync: { running: boolean; banksDone: number };
};

export type SyncProgress = { running: boolean; banksDone: number; banksTotal: number };

export type DueRecurringCharge = OutlookRecurringCharge & {
  /** Its expected date has passed and it hasn't arrived: still owed, any day. */
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
      usualMonth: number;
      /** Only ever a suggestion: confirming it goes through the monthly-targets write path. */
      suggestedTarget: number;
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
      /** YYYY-MM-DD of the first day the projection exceeds the target; null when it doesn't. */
      crossingDate: string | null;
      /** Which side of the blend dominates; null with no projection. */
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
    };

function toAgorot(amount: number): number {
  return Math.round(amount * 100) / 100 || 0;
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
 * month, not future-dated, not an unreconciled settlement charge, and not a
 * pending row its stored completed twin supersedes.
 */
function countedRows(rows: readonly OutlookRow[], month: YearMonth, throughDate: string) {
  const prefix = `${monthKey(month)}-`;
  const superseded = pendingWithCompletedTwin(rows);
  return rows.filter(
    (r) =>
      r.date.startsWith(prefix) &&
      r.date <= throughDate &&
      !superseded.has(r.id) &&
      !(r.categoryType === "expense" && isBankLumpCandidate(r)),
  );
}

/**
 * A month's expenses by the outlook's rules — what the DB wrapper reports as a
 * prior month's history, so the usual month and this month's spend agree.
 */
export function outlookMonthExpenses(rows: readonly OutlookRow[], month: YearMonth): number {
  const lastDay = new Date(month.year, month.month, 0).getDate();
  return computeMonthlySummary(countedRows(rows, month, isoDay(month, lastDay))).expenses;
}

function isComplete(month: YearMonth, dataSince: string | null): boolean {
  return dataSince !== null && dataSince <= isoDay(month, 1);
}

/** Mean of the latest complete prior months with expense data, or null when history is thin. */
function usualMonthOf(input: MonthOutlookInput): number | null {
  const current = input.month.year * 12 + input.month.month;
  const full = input.history
    .filter((h) => h.month.year * 12 + h.month.month < current)
    .filter((h) => h.expenses > 0 && isComplete(h.month, input.dataSince))
    .sort((a, b) => b.month.year * 12 + b.month.month - (a.month.year * 12 + a.month.month));
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
  day: number;
  daysInMonth: number;
}): { projection: Projection; basis: ProjectionBasis } {
  const { counted, spent, usualMonth, recurring, dueCharges, day, daysInMonth } = args;

  let cum = 0;
  const actual = dailyNetExpense(counted, day).map((amount) => toAgorot((cum += amount)));

  // Recurring charges are placed on their own dates, so both rates are of
  // variable spend only — rent on day 1 must not be extrapolated across the month.
  const arrived = recurring.filter((c) => c.arrived).reduce((sum, c) => sum + c.amount, 0);
  const recurringMonth = recurring.reduce((sum, c) => sum + c.amount, 0);
  const paceRate = Math.max(0, spent - arrived) / day;
  const historyRate = Math.max(0, usualMonth - recurringMonth) / daysInMonth;
  const historyWeight = Math.max(0, 1 - day / HISTORY_WEIGHT_DECAY_DAYS);
  const rate = historyWeight * historyRate + (1 - historyWeight) * paceRate;

  // A late charge (or one dated today or earlier) lands on the next day; on the
  // month's last day there is no next day, so it lands today.
  const landing = new Map<number, number>();
  for (const c of dueCharges) {
    const landDay = Math.min(daysInMonth, Math.max(dayOf(c.expectedDate), day + 1));
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
    basis: historyWeight > 0.5 ? "usual-month" : "this-month-pace",
  };
}

function crossingDateOf(
  projected: readonly number[],
  spent: number,
  target: number,
  month: YearMonth,
  day: number,
): string | null {
  if (spent > target) return null;
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

  if (isMonthClosed(month, today)) {
    const lastDay = new Date(month.year, month.month, 0).getDate();
    const summary = computeMonthlySummary(countedRows(input.rows, month, isoDay(month, lastDay)));
    return {
      state: "closed",
      income: toAgorot(summary.income),
      expenses: summary.expenses,
      net: toAgorot(summary.netSavings),
      target,
      overBy:
        target !== null && summary.expenses > target ? toAgorot(summary.expenses - target) : null,
    };
  }

  const elapsed = monthElapsed(month, today);
  if (elapsed.dayOfMonth === 0) {
    throw new RangeError("monthOutlook: the month has not started yet");
  }

  const counted = countedRows(input.rows, month, today);
  const spent = computeMonthlySummary(counted).expenses;
  const asOf = input.lastSuccessfulSyncAt;
  const stale = input.now.getTime() - asOf.getTime() > STALE_SYNC_AFTER_MS;
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
    .map((c) => ({ ...c, late: c.expectedDate < today }));
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
      ? crossingDateOf(projected.projection.projected, spent, target, month, elapsed.dayOfMonth)
      : null,
    projectionBasis: projected?.basis ?? null,
    asOf,
    stale,
  };
}
