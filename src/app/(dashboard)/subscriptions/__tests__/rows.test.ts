import { describe, it, expect } from "vitest";
import type { PersistedRecurringPattern, SeriesProjection } from "@/lib/recurring-detection";
import {
  toSubscriptionRow,
  sortSubscriptionRows,
  filterSubscriptionRows,
  visibleFilters,
  type AnomalyAlerts,
  type SubscriptionRow,
} from "../rows";

const TODAY = new Date("2026-03-15T10:30:00.000Z");

function pattern(overrides: Partial<PersistedRecurringPattern> = {}): PersistedRecurringPattern {
  return {
    id: "p1",
    merchant: "STREAMBOX",
    displayName: null,
    expectedAmount: 39.9,
    cadence: "monthly",
    occurrenceDates: [],
    lastMatchedTxnId: "",
    patternFingerprint: "fp",
    nextExpectedDate: new Date("2020-01-01T00:00:00.000Z"),
    status: "active",
    confirmedAt: null,
    ...overrides,
  };
}

function projection(
  lastCharge: string,
  projected: string,
  silenceDays: number,
  isLive = true,
): SeriesProjection {
  return {
    patternId: "p1",
    isLive,
    evidence: {
      lastObservedChargeDate: new Date(`${lastCharge}T00:00:00.000Z`),
      projectedDate: new Date(`${projected}T00:00:00.000Z`),
      silenceDays,
      observedAmount: 39.9,
    },
  };
}

describe("toSubscriptionRow liveness", () => {
  it("projects a live series' next charge ahead of today with the days left", () => {
    const row = toSubscriptionRow(pattern(), projection("2026-03-01", "2026-03-31", 14), TODAY);
    expect(row.projectedDate).toBe("2026-03-31");
    expect(row.liveness).toEqual({
      kind: "upcoming",
      projectedDate: "2026-03-31",
      lastChargeDate: "2026-03-01",
      daysUntil: 16,
    });
  });

  it("reads a projection that lands today as due today, not late", () => {
    const row = toSubscriptionRow(pattern(), projection("2026-02-13", "2026-03-15", 30), TODAY);
    expect(row.liveness).toMatchObject({ kind: "upcoming", daysUntil: 0 });
  });

  it("keeps a live series whose projected date has passed as late, still expected", () => {
    const row = toSubscriptionRow(pattern(), projection("2026-02-08", "2026-03-10", 35), TODAY);
    expect(row.projectedDate).toBe("2026-03-10");
    expect(row.liveness).toEqual({
      kind: "late",
      projectedDate: "2026-03-10",
      lastChargeDate: "2026-02-08",
      daysLate: 5,
    });
  });

  it("gives a dead series no projected charge, only its silence since the last charge", () => {
    const row = toSubscriptionRow(
      pattern(),
      projection("2026-01-10", "2026-02-09", 64, false),
      TODAY,
    );
    expect(row.projectedDate).toBeNull();
    expect(row.liveness).toEqual({ kind: "silent", lastChargeDate: "2026-01-10", silenceDays: 64 });
  });

  it("says so when the window holds no matching charge at all", () => {
    const row = toSubscriptionRow(
      pattern(),
      { patternId: "p1", isLive: false, evidence: null },
      TODAY,
    );
    expect(row.projectedDate).toBeNull();
    expect(row.liveness).toEqual({ kind: "no-evidence" });
  });

  it("carries the pattern's identity, amount, cadence and status through", () => {
    const row = toSubscriptionRow(
      pattern({ displayName: "Streambox", status: "paused", cadence: "annual" }),
      projection("2026-03-01", "2027-03-01", 14),
      TODAY,
    );
    expect(row).toMatchObject({
      id: "p1",
      merchant: "STREAMBOX",
      displayName: "Streambox",
      expectedAmount: 39.9,
      cadence: "annual",
      status: "paused",
    });
  });
});

function row(id: string, overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id,
    merchant: id.toUpperCase(),
    displayName: null,
    expectedAmount: 10,
    cadence: "monthly",
    projectedDate: "2026-03-20",
    liveness: { kind: "no-evidence" },
    status: "active",
    confirmedAt: null,
    ...overrides,
  };
}

const NO_ALERTS: AnomalyAlerts = {
  priceChanges: [],
  missedPayments: [],
  newlyDetected: [],
  dormant: [],
};

describe("sortSubscriptionRows", () => {
  const rows = [
    row("a", { expectedAmount: 30, projectedDate: "2026-03-25" }),
    row("b", { expectedAmount: 10, projectedDate: null }),
    row("c", { expectedAmount: 20, projectedDate: "2026-03-18" }),
  ];

  it("orders by next charge, rows without one last in either direction", () => {
    expect(sortSubscriptionRows(rows, "projectedDate", "asc").map((r) => r.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(sortSubscriptionRows(rows, "projectedDate", "desc").map((r) => r.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("orders by expected amount", () => {
    expect(sortSubscriptionRows(rows, "expectedAmount", "desc").map((r) => r.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });
});

describe("filterSubscriptionRows", () => {
  const alerts: AnomalyAlerts = {
    ...NO_ALERTS,
    dormant: [
      {
        type: "dormant",
        patternId: "d",
        merchant: "D",
        lastObservedChargeDate: null,
        silenceDays: null,
        cadence: "monthly",
      },
    ],
    priceChanges: [
      {
        type: "price_change",
        patternId: "p",
        merchant: "P",
        oldAmount: 10,
        newAmount: 12,
        pctChange: 0.2,
      },
    ],
  };
  const rows = [row("d"), row("p"), row("x", { status: "paused" })];

  it("shows dormant series only under the dormant filter", () => {
    expect(filterSubscriptionRows(rows, alerts, "all").map((r) => r.id)).toEqual(["p", "x"]);
    expect(filterSubscriptionRows(rows, alerts, "dormant").map((r) => r.id)).toEqual(["d"]);
  });

  it("narrows to one alert kind or to active series", () => {
    expect(filterSubscriptionRows(rows, alerts, "price_change").map((r) => r.id)).toEqual(["p"]);
    expect(filterSubscriptionRows(rows, alerts, "active").map((r) => r.id)).toEqual(["p"]);
  });

  it("offers a filter per alert kind that has alerts, beside all and active", () => {
    expect(visibleFilters(alerts)).toEqual(["all", "price_change", "dormant", "active"]);
    expect(visibleFilters(NO_ALERTS)).toEqual([]);
  });
});
