import type {
  DormantAlert,
  MissedPaymentAlert,
  NewlyDetectedAlert,
  PersistedRecurringPattern,
  PriceChangeAlert,
  SeriesProjection,
} from "@/lib/recurring-detection";

/**
 * What the series' charge evidence says right now (ADR-0012, CONTEXT.md
 * "liveness evidence" / "projected charge"). Derived from the projection only:
 * the stored `next_expected_date` is never displayed.
 *
 * - `upcoming`: live, projected charge today or later.
 * - `late`: live, projected charge already passed: still expected any day.
 * - `silent`: dead by evidence (silence past the death threshold): no
 *   projected charge, only how long it has been quiet.
 * - `no-evidence`: no matching charge in the window at all.
 */
export type SubscriptionLiveness =
  | { kind: "upcoming"; projectedDate: string; lastChargeDate: string; daysUntil: number }
  | { kind: "late"; projectedDate: string; lastChargeDate: string; daysLate: number }
  | { kind: "silent"; lastChargeDate: string; silenceDays: number }
  | { kind: "no-evidence" };

export type SubscriptionRow = {
  id: string;
  merchant: string;
  displayName: string | null;
  expectedAmount: number;
  cadence: "monthly" | "quarterly" | "annual";
  /** The projected next charge (ISO date); null when the series is not live. Sort key. */
  projectedDate: string | null;
  liveness: SubscriptionLiveness;
  status: "active" | "paused" | "canceled";
  confirmedAt: Date | null;
};

export type AnomalyAlerts = {
  priceChanges: PriceChangeAlert[];
  missedPayments: MissedPaymentAlert[];
  newlyDetected: NewlyDetectedAlert[];
  dormant: DormantAlert[];
};

const MS_PER_DAY = 86_400_000;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * One table row from a persisted pattern and its projection. `today` is the
 * same instant the projection was computed at, so the day counts here agree
 * with the projection's own UTC day-floor silence arithmetic.
 */
export function toSubscriptionRow(
  pattern: PersistedRecurringPattern,
  projection: SeriesProjection,
  today: Date,
): SubscriptionRow {
  const { isLive, evidence } = projection;
  let liveness: SubscriptionLiveness;
  if (!evidence) {
    liveness = { kind: "no-evidence" };
  } else if (!isLive) {
    // A dead series gets no projected charge; projecting one is the #192 defect.
    liveness = {
      kind: "silent",
      lastChargeDate: isoDate(evidence.lastObservedChargeDate),
      silenceDays: evidence.silenceDays,
    };
  } else {
    // Projections sit on UTC midnight and `today` is a full instant, so the
    // ceiling counts calendar days left (0 = due today).
    const daysUntil =
      Math.ceil((evidence.projectedDate.getTime() - today.getTime()) / MS_PER_DAY) || 0;
    const projectedDate = isoDate(evidence.projectedDate);
    const lastChargeDate = isoDate(evidence.lastObservedChargeDate);
    liveness =
      daysUntil >= 0
        ? { kind: "upcoming", projectedDate, lastChargeDate, daysUntil }
        : { kind: "late", projectedDate, lastChargeDate, daysLate: -daysUntil };
  }

  return {
    id: pattern.id,
    merchant: pattern.merchant,
    displayName: pattern.displayName,
    expectedAmount: pattern.expectedAmount,
    cadence: pattern.cadence,
    projectedDate:
      liveness.kind === "upcoming" || liveness.kind === "late" ? liveness.projectedDate : null,
    liveness,
    status: pattern.status,
    confirmedAt: pattern.confirmedAt,
  };
}

export type SortKey = "expectedAmount" | "projectedDate";
export type SortDir = "asc" | "desc";

export function sortSubscriptionRows(
  rows: SubscriptionRow[],
  key: SortKey,
  dir: SortDir,
): SubscriptionRow[] {
  return [...rows].sort((a, b) => {
    if (key === "expectedAmount") {
      const cmp = a.expectedAmount - b.expectedAmount;
      return dir === "asc" ? cmp : -cmp;
    }
    // Rows without liveness evidence have no projected charge: they sort last
    // in both directions rather than clustering at whichever end null lands on.
    if (a.projectedDate === null || b.projectedDate === null) {
      if (a.projectedDate === b.projectedDate) return 0;
      return a.projectedDate === null ? 1 : -1;
    }
    const cmp = a.projectedDate.localeCompare(b.projectedDate);
    return dir === "asc" ? cmp : -cmp;
  });
}

export type FilterKey =
  | "all"
  | "price_change"
  | "missed_payment"
  | "newly_detected"
  | "dormant"
  | "active";

const FILTER_ORDER: FilterKey[] = [
  "all",
  "price_change",
  "missed_payment",
  "newly_detected",
  "dormant",
  "active",
];

function alertCount(alerts: AnomalyAlerts, key: FilterKey): number | null {
  switch (key) {
    case "price_change":
      return alerts.priceChanges.length;
    case "missed_payment":
      return alerts.missedPayments.length;
    case "newly_detected":
      return alerts.newlyDetected.length;
    case "dormant":
      return alerts.dormant.length;
    default:
      return null;
  }
}

/** The filters worth offering: none without alerts; otherwise all, active and each alert kind present. */
export function visibleFilters(alerts: AnomalyAlerts): FilterKey[] {
  const total =
    alerts.priceChanges.length +
    alerts.missedPayments.length +
    alerts.newlyDetected.length +
    alerts.dormant.length;
  if (total === 0) return [];
  return FILTER_ORDER.filter((key) => {
    const count = alertCount(alerts, key);
    return count === null || count > 0;
  });
}

export function filterSubscriptionRows(
  rows: SubscriptionRow[],
  alerts: AnomalyAlerts,
  filter: FilterKey,
): SubscriptionRow[] {
  const ids = (list: { patternId: string }[]) => new Set(list.map((a) => a.patternId));
  const dormant = ids(alerts.dormant);
  switch (filter) {
    // Dormant series appear ONLY under the dormant filter: dead by evidence,
    // they await the owner's verdict rather than reading as live subscriptions.
    case "all":
      return rows.filter((r) => !dormant.has(r.id));
    case "active":
      return rows.filter((r) => r.status === "active" && !dormant.has(r.id));
    case "dormant":
      return rows.filter((r) => dormant.has(r.id));
    case "price_change": {
      const set = ids(alerts.priceChanges);
      return rows.filter((r) => set.has(r.id));
    }
    case "missed_payment": {
      const set = ids(alerts.missedPayments);
      return rows.filter((r) => set.has(r.id));
    }
    case "newly_detected": {
      const set = ids(alerts.newlyDetected);
      return rows.filter((r) => set.has(r.id));
    }
  }
}
