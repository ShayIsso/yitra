import { describe, it, expect } from "vitest";
import {
  getMonthOutlookWithStore,
  type MonthOutlookStore,
  type OutlookClock,
  type OutlookRow,
} from "@/lib/budgets";
import { extractMerchant } from "@/lib/transaction-matching";
import type { DetectionTransaction, PersistedRecurringPattern } from "@/lib/recurring-detection";
import type { SyncRunSummary } from "@/lib/sync/runs";

const CLOCK: OutlookClock = { today: "2026-06-15", now: new Date("2026-06-15T09:00:00Z") };
const JUNE = { year: 2026, month: 6 };
const SYNCED = new Date("2026-06-15T06:00:00Z");

let nextId = 0;
function spend(date: string, amount: number): OutlookRow {
  nextId += 1;
  return {
    id: `row-${nextId}`,
    bankAccountId: "acct-card",
    bankType: "max",
    date,
    description: `Invented Shop ${nextId}`,
    chargedAmount: -amount,
    status: "completed",
    categoryType: "expense",
  };
}

function series(
  description: string,
  over: Partial<PersistedRecurringPattern> = {},
): PersistedRecurringPattern {
  nextId += 1;
  return {
    id: `series-${nextId}`,
    merchant: extractMerchant(description),
    expectedAmount: 0,
    cadence: "monthly",
    occurrenceDates: [],
    lastMatchedTxnId: "unused",
    patternFingerprint: `fp-${nextId}`,
    nextExpectedDate: new Date("2026-01-01"),
    displayName: null,
    status: "active",
    confirmedAt: null,
    ...over,
  };
}

function charge(description: string, date: string, amount: number): DetectionTransaction {
  nextId += 1;
  return { id: `det-${nextId}`, description, date, chargedAmount: -amount };
}

function run(bank: string, finishedAt: Date | null): SyncRunSummary {
  nextId += 1;
  return {
    id: `run-${nextId}`,
    bank,
    status: "success",
    transactionsImported: 0,
    startedAt: finishedAt ?? CLOCK.now,
    finishedAt,
    errorMessage: null,
  };
}

/** A store over plain arrays; `loadRows` honors its date window as the SQL does. */
function store(
  over: Partial<{
    rows: OutlookRow[];
    dataSince: string | null;
    target: number | null;
    patterns: PersistedRecurringPattern[];
    detection: DetectionTransaction[];
    banks: string[];
    lastRuns: SyncRunSummary[];
    successes: { bank: string; finishedAt: Date }[];
    running: boolean;
  }> = {},
): MonthOutlookStore & { windows: [string, string][] } {
  const data = {
    rows: [],
    dataSince: "2025-01-01",
    target: 6000,
    patterns: [],
    detection: [],
    banks: ["discount", "max"],
    lastRuns: [run("discount", SYNCED), run("max", SYNCED)],
    successes: [
      { bank: "discount", finishedAt: SYNCED },
      { bank: "max", finishedAt: SYNCED },
    ],
    running: false,
    ...over,
  };
  const windows: [string, string][] = [];
  return {
    windows,
    async loadRows(from, to) {
      windows.push([from, to]);
      return data.rows.filter((r) => r.date >= from && r.date <= to);
    },
    async earliestTransactionDate() {
      return data.dataSince;
    },
    async expenseTarget() {
      return data.target;
    },
    async recurring() {
      return { patterns: data.patterns, transactions: data.detection };
    },
    async credentialBankTypes() {
      return data.banks;
    },
    async lastRunPerBank() {
      return data.lastRuns;
    },
    async lastRecordedSuccessPerBank() {
      return data.successes;
    },
    async isSyncRunning() {
      return data.running;
    },
  };
}

describe("getMonthOutlookWithStore", () => {
  it("reads calendar months on transactions.date: this month's spend and prior months' usual month", async () => {
    const s = store({
      target: null,
      rows: [
        spend("2026-03-04", 3000),
        spend("2026-04-30", 4000),
        spend("2026-05-01", 5000),
        spend("2026-05-31", 500),
        spend("2026-06-01", 200),
        spend("2026-06-30", 999),
      ],
    });
    const outlook = await getMonthOutlookWithStore(JUNE, CLOCK, s);
    expect(outlook).toMatchObject({ state: "no-target", spent: 200, usualMonth: 4166.67 });
    expect(s.windows).toEqual([["2025-06-01", "2026-06-30"]]);
  });

  it("judges recurring charges by liveness evidence: arrived, late, paused and dead", async () => {
    const outlook = await getMonthOutlookWithStore(
      JUNE,
      CLOCK,
      store({
        patterns: [
          series("Invented Gym"),
          series("Invented Stream"),
          series("Invented Paper", { status: "paused" }),
          series("Invented Club"),
        ],
        detection: [
          charge("Invented Gym", "2026-05-02", 150),
          charge("Invented Gym", "2026-06-02", 150),
          charge("Invented Stream", "2026-04-10", 40),
          charge("Invented Stream", "2026-05-10", 40),
          charge("Invented Paper", "2026-05-12", 60),
          charge("Invented Club", "2026-02-01", 90),
        ],
      }),
    );
    expect(outlook).toMatchObject({
      state: "active",
      dueRecurring: 40,
      dueCharges: [{ amount: 40, expectedDate: "2026-06-09", arrived: false, late: true }],
    });
  });

  it("counts a series charge the bank lists later this month as due on that date", async () => {
    const outlook = await getMonthOutlookWithStore(
      JUNE,
      CLOCK,
      store({
        patterns: [series("Invented Gym")],
        detection: [
          charge("Invented Gym", "2026-05-20", 150),
          charge("Invented Gym", "2026-06-20", 150),
        ],
      }),
    );
    expect(outlook).toMatchObject({
      dueCharges: [{ amount: 150, expectedDate: "2026-06-20", late: false }],
    });
  });

  it("is as of the oldest connected institution's last successful sync", async () => {
    const older = new Date("2026-06-11T08:00:00Z");
    const outlook = await getMonthOutlookWithStore(
      JUNE,
      CLOCK,
      store({
        successes: [
          { bank: "discount", finishedAt: SYNCED },
          { bank: "max", finishedAt: older },
          { bank: "visaCal", finishedAt: new Date("2026-01-01T08:00:00Z") },
        ],
      }),
    );
    expect(outlook).toMatchObject({ asOf: older, stale: true });
  });

  it("reports first-sync progress from the connected institutions' finished runs", async () => {
    const outlook = await getMonthOutlookWithStore(
      JUNE,
      CLOCK,
      store({
        successes: [],
        running: true,
        lastRuns: [run("discount", new Date("2026-06-15T08:58:00Z")), run("max", null)],
      }),
    );
    expect(outlook).toEqual({
      state: "first-sync",
      progress: { running: true, banksDone: 1, banksTotal: 2 },
    });
  });

  it("is no-connection with no credentials, whatever history remains", async () => {
    const outlook = await getMonthOutlookWithStore(
      JUNE,
      CLOCK,
      store({ banks: [], rows: [spend("2026-06-02", 100)] }),
    );
    expect(outlook).toEqual({ state: "no-connection" });
  });
});
