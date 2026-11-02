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
function spend(date: string, amount: number, over: Partial<OutlookRow> = {}): OutlookRow {
  nextId += 1;
  return {
    id: `row-${nextId}`,
    date,
    description: `Invented Shop ${nextId}`,
    chargedAmount: -amount,
    categoryType: "expense",
    reconciliationRole: null,
    ...over,
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

/** A stored transaction seen both as detection evidence and as a month row. */
function stored(
  description: string,
  date: string,
  amount: number,
  over: Partial<OutlookRow> = {},
): { evidence: DetectionTransaction; row: OutlookRow } {
  const evidence = charge(description, date, amount);
  return { evidence, row: spend(date, amount, { id: evidence.id, description, ...over }) };
}

function run(bank: string, finishedAt: Date | null, startedAt?: Date): SyncRunSummary {
  nextId += 1;
  return {
    id: `run-${nextId}`,
    bank,
    status: "success",
    transactionsImported: 0,
    startedAt: startedAt ?? finishedAt ?? CLOCK.now,
    finishedAt,
    errorMessage: null,
  };
}

/** A store over plain arrays; `loadMonth` buckets rows by calendar month as the SQL does. */
function store(
  over: Partial<{
    rows: OutlookRow[];
    accountStarts: string[];
    target: number | null;
    patterns: PersistedRecurringPattern[];
    detection: DetectionTransaction[];
    banks: string[];
    lastRuns: SyncRunSummary[];
    successes: { bank: string; finishedAt: Date }[];
    /** Defaults to the earliest of `successes`. */
    firstSuccess: Date | null;
    runningSince: Date | null;
  }> = {},
): MonthOutlookStore & { monthsRead: string[] } {
  const data = {
    rows: [],
    accountStarts: ["2025-01-01", "2025-01-03"],
    target: 6000,
    patterns: [],
    detection: [],
    banks: ["discount", "max"],
    lastRuns: [run("discount", SYNCED), run("max", SYNCED)],
    successes: [
      { bank: "discount", finishedAt: SYNCED },
      { bank: "max", finishedAt: SYNCED },
    ],
    runningSince: null,
    ...over,
  };
  const monthsRead: string[] = [];
  return {
    monthsRead,
    async loadMonth({ year, month }) {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      monthsRead.push(key);
      return data.rows.filter((r) => r.date.startsWith(`${key}-`));
    },
    async accountHistoryStarts() {
      return data.accountStarts;
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
    async firstRecordedSuccessAt() {
      if (over.firstSuccess !== undefined) return over.firstSuccess;
      const times = data.successes.map((s) => s.finishedAt.getTime());
      return times.length === 0 ? null : new Date(Math.min(...times));
    },
    async syncRunningSince() {
      return data.runningSince;
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
    expect([...s.monthsRead].sort()).toEqual([
      "2025-06",
      "2025-07",
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });

  it("excludes the flagged settlement lump from history months too", async () => {
    const outlook = await getMonthOutlookWithStore(
      JUNE,
      CLOCK,
      store({
        target: null,
        rows: [
          spend("2026-05-02", 3000, { reconciliationRole: "settlement_lump" }),
          spend("2026-05-03", 900, { description: "חיוב ישיר ביטוח" }),
        ],
      }),
    );
    expect(outlook).toMatchObject({ usualMonth: 900 });
  });

  it("counts two pending look-alikes and their posted twin as three purchases", async () => {
    const description = "Invented Coffee";
    const outlook = await getMonthOutlookWithStore(
      JUNE,
      CLOCK,
      store({
        target: null,
        rows: [
          spend("2026-05-10", 1000),
          Object.assign({ status: "pending" }, spend("2026-06-08", 120, { description })),
          Object.assign({ status: "pending" }, spend("2026-06-09", 120, { description })),
          spend("2026-06-10", 120, { description }),
        ],
      }),
    );
    expect(outlook).toMatchObject({ spent: 360 });
  });

  it("is thin history until every account's data reaches back to a prior month's first day", async () => {
    // The bank goes back a year; the card only three weeks — prior months hold bank spend only.
    const outlook = await getMonthOutlookWithStore(
      JUNE,
      CLOCK,
      store({
        target: null,
        accountStarts: ["2025-06-01", "2026-05-20"],
        rows: [spend("2026-04-10", 800), spend("2026-05-10", 900)],
      }),
    );
    expect(outlook.state).toBe("thin-history");
  });

  it("judges recurring charges by liveness evidence: arrived, late, paused and dead", async () => {
    const gym = stored("Invented Gym", "2026-06-02", 150);
    const outlook = await getMonthOutlookWithStore(
      JUNE,
      CLOCK,
      store({
        rows: [gym.row],
        patterns: [
          series("Invented Gym"),
          series("Invented Stream"),
          series("Invented Paper", { status: "paused" }),
          series("Invented Club"),
        ],
        detection: [
          charge("Invented Gym", "2026-05-02", 150),
          gym.evidence,
          charge("Invented Stream", "2026-04-10", 40),
          charge("Invented Stream", "2026-05-10", 40),
          charge("Invented Paper", "2026-05-12", 60),
          charge("Invented Club", "2026-02-01", 90),
        ],
      }),
    );
    expect(outlook).toMatchObject({
      state: "active",
      spent: 150,
      dueRecurring: 40,
      dueCharges: [{ amount: 40, expectedDate: "2026-06-09", arrived: false, late: true }],
    });
  });

  it("keeps a recurring charge due while its posted row is uncategorized and so not yet spent", async () => {
    const gym = stored("Invented Gym", "2026-06-02", 150, { categoryType: null });
    const outlook = await getMonthOutlookWithStore(
      JUNE,
      CLOCK,
      store({
        rows: [gym.row],
        patterns: [series("Invented Gym")],
        detection: [charge("Invented Gym", "2026-05-02", 150), gym.evidence],
      }),
    );
    expect(outlook).toMatchObject({
      spent: 0,
      dueRecurring: 150,
      remaining: 5850,
      dueCharges: [{ amount: 150, arrived: false }],
    });
  });

  it("counts a series charge the bank lists later this month as due on that date", async () => {
    const gym = stored("Invented Gym", "2026-06-20", 150);
    const outlook = await getMonthOutlookWithStore(
      JUNE,
      CLOCK,
      store({
        rows: [gym.row],
        patterns: [series("Invented Gym")],
        detection: [charge("Invented Gym", "2026-05-20", 150), gym.evidence],
      }),
    );
    expect(outlook).toMatchObject({
      spent: 0,
      dueCharges: [{ amount: 150, expectedDate: "2026-06-20", late: false }],
    });
  });

  it("finds this month's charge of a series the bank already lists into later months", async () => {
    const june = stored("Invented Sofa", "2026-06-20", 400);
    const july = stored("Invented Sofa", "2026-07-20", 400);
    const outlook = await getMonthOutlookWithStore(
      JUNE,
      CLOCK,
      store({
        rows: [june.row, july.row],
        patterns: [series("Invented Sofa")],
        detection: [charge("Invented Sofa", "2026-05-20", 400), june.evidence, july.evidence],
      }),
    );
    expect(outlook).toMatchObject({
      spent: 0,
      dueRecurring: 400,
      dueCharges: [{ amount: 400, expectedDate: "2026-06-20", late: false }],
    });
  });

  it("stays first-sync while the first run is still going, even after a bank finished", async () => {
    const runStart = new Date("2026-06-15T08:50:00Z");
    const finished = new Date("2026-06-15T08:58:00Z");
    const outlook = await getMonthOutlookWithStore(
      JUNE,
      CLOCK,
      store({
        runningSince: runStart,
        successes: [{ bank: "discount", finishedAt: finished }],
        firstSuccess: finished,
        lastRuns: [
          run("discount", finished, new Date("2026-06-15T08:51:00Z")),
          run("max", null, new Date("2026-06-15T08:59:00Z")),
        ],
      }),
    );
    expect(outlook).toEqual({
      state: "first-sync",
      progress: { running: true, banksDone: 1, banksTotal: 2 },
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

  it("reports first-sync progress in connected credentials finished by the current run", async () => {
    const runStart = new Date("2026-06-15T08:50:00Z");
    const outlook = await getMonthOutlookWithStore(
      JUNE,
      CLOCK,
      store({
        banks: ["discount", "max", "visaCal"],
        successes: [],
        runningSince: runStart,
        lastRuns: [
          run("discount", new Date("2026-06-15T08:58:00Z"), new Date("2026-06-15T08:51:00Z")),
          run("max", null, new Date("2026-06-15T08:59:00Z")),
          // A failed attempt from yesterday is not progress of this run.
          run("visaCal", new Date("2026-06-14T10:05:00Z"), new Date("2026-06-14T10:00:00Z")),
        ],
      }),
    );
    expect(outlook).toEqual({
      state: "first-sync",
      progress: { running: true, banksDone: 1, banksTotal: 3 },
    });
  });

  it("reports no progress when no first sync is running", async () => {
    const outlook = await getMonthOutlookWithStore(
      JUNE,
      CLOCK,
      store({ successes: [], lastRuns: [run("discount", new Date("2026-06-14T10:05:00Z"))] }),
    );
    expect(outlook).toEqual({
      state: "first-sync",
      progress: { running: false, banksDone: 0, banksTotal: 2 },
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
