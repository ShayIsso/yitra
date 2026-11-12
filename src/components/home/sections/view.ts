/**
 * The home sections below the trends (#321): budgets, goals, top merchants,
 * attention, upcoming charges, accounts and activity. Every figure is one the
 * server returned; the helpers here only pick, order and place it.
 */
import type { BudgetVerdict } from "@/lib/budgets";
import type { OnboardingPathFacts } from "@/lib/onboarding/path";
import type { Cadence } from "@/lib/recurring-detection";
import type { SyncRunStatus } from "@/lib/sync/runs";
import { transactionsHref } from "@/lib/transactions/view-params";

/** `/api/attention-counts`: four independent queue sizes. */
export type AttentionCounts = {
  uncategorized: number;
  needsReview: number;
  anomalies: number;
  reviewQueue: number;
};

export type AttentionItem = {
  key: keyof AttentionCounts;
  label: string;
  href: string;
  count: number;
};

// The subscriptions and reconciliation pages compute their whole alert and
// inbox state on every load, so landing on the page is the filter.
const ATTENTION_DEFS: readonly Omit<AttentionItem, "count">[] = [
  {
    key: "uncategorized",
    label: "תנועות בלי קטגוריה",
    href: transactionsHref({ uncategorized: true }),
  },
  {
    key: "needsReview",
    label: "הצעות סיווג לאישור",
    href: transactionsHref({ needsReview: true }),
  },
  { key: "anomalies", label: "חריגות במנויים", href: "/subscriptions" },
  { key: "reviewQueue", label: "התאמות לבדיקה", href: "/reconciliation" },
];

/** The queues that hold something, real counts uncapped; an empty queue needs nothing. */
export function attentionItems(counts: AttentionCounts): AttentionItem[] {
  return ATTENTION_DEFS.map((def) => ({ ...def, count: counts[def.key] })).filter(
    (item) => item.count > 0,
  );
}

/** One `/api/recurring-upcoming` entry: a projected charge (CONTEXT.md), over the wire. */
export type UpcomingCharge = {
  id: string;
  merchant: string;
  displayName: string | null;
  expectedAmount: number;
  cadence: Cadence;
  /** YYYY-MM-DD; in the past when the series is late but live (ADR-0012). */
  projectedDate: string;
};

export const UPCOMING_SHOWN = 5;

export type UpcomingWhen = { late: true } | { late: false; inDays: number };

const MS_PER_DAY = 86_400_000;

function dayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

/**
 * When a projected charge is expected, from the home calendar day. Late is the
 * month outlook's rule for a charge that hasn't posted (`dueCharges[].late`):
 * its date is strictly before today. A charge that did post moved its series'
 * projection on to the next cycle, so the outlook's other case (posted but
 * awaiting a category, never late) cannot reach this list.
 */
export function upcomingWhen(projectedDate: string, today: string): UpcomingWhen {
  if (projectedDate < today) return { late: true };
  return { late: false, inDays: Math.round(dayIndex(projectedDate) - dayIndex(today)) };
}

export type UpcomingRow = UpcomingCharge & { when: UpcomingWhen };

/** The endpoint's order (earliest first, so late charges lead), capped. */
export function upcomingList(
  charges: readonly UpcomingCharge[],
  today: string,
): { rows: UpcomingRow[]; hidden: number } {
  const rows = charges
    .slice(0, UPCOMING_SHOWN)
    .map((c) => ({ ...c, when: upcomingWhen(c.projectedDate, today) }));
  return { rows, hidden: Math.max(0, charges.length - UPCOMING_SHOWN) };
}

/** Balances read neutral; only a negative one is flagged (and never by colour alone). */
export function balanceTone(balance: number | null): "neutral" | "negative" | "unknown" {
  if (balance === null) return "unknown";
  return balance < 0 ? "negative" : "neutral";
}

/** A card account's next debit day, as an unpadded "day.month". */
export function debitDayHint(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${day}.${month}`;
}

export type BudgetRing = {
  /** Share of the ring drawn, 0–1. */
  fill: number;
  /** Whole percent spent; null when a zero limit meets spend. */
  percent: number | null;
  attention: boolean;
};

/** A budget's ring, from the pace the budgets module computed (CONTEXT.md "budget pace"). */
export function budgetRing(pace: { spentFraction: number; verdict: BudgetVerdict }): BudgetRing {
  const finite = Number.isFinite(pace.spentFraction);
  return {
    fill: finite ? Math.max(0, Math.min(1, pace.spentFraction)) : 1,
    percent: finite ? Math.round(pace.spentFraction * 100) : null,
    attention: pace.verdict === "over" || pace.verdict === "at-risk",
  };
}

/** A goal's ladder fill (already capped server-side, CONTEXT.md "goal ladder"), as a bar width. */
export function goalFillPercent(current: number, target: number): number {
  if (target === 0) return 0;
  return Math.max(0, Math.min(100, (current / target) * 100));
}

/** Bar widths for the ranked merchants, relative to the list's own largest figure. */
export function merchantBarPercents<T extends { amount: number }>(
  merchants: readonly T[],
): number[] {
  const max = Math.max(0, ...merchants.map((m) => m.amount));
  if (max <= 0) return merchants.map(() => 0);
  return merchants.map((m) => Math.max(0, Math.min(100, (m.amount / max) * 100)));
}

/**
 * The onboarding path's facts, or null while one is unknown (the nudge stays
 * out rather than guess). The sections mount only with a connected
 * institution. Balances exist only once a sync landed, so they cover a bank
 * whose latest run failed after an earlier success (the runs are last-per-bank).
 */
export function onboardingFacts(
  attention: AttentionCounts | null,
  balances: readonly unknown[] | null,
  runs: readonly { status: SyncRunStatus }[],
): OnboardingPathFacts | null {
  if (attention === null) return null;
  const ran = runs.some((run) => run.status === "success");
  if (!ran && balances === null) return null;
  return {
    hasCredential: true,
    hasSuccessfulSync: ran || (balances !== null && balances.length > 0),
    uncategorizedCount: attention.uncategorized,
  };
}
