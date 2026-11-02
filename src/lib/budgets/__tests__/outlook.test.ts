import { describe, it, expect } from "vitest";
import { monthOutlook, type MonthOutlookInput, type OutlookRow } from "@/lib/budgets";

const NOW = new Date("2026-06-15T09:00:00Z");

/** A current-month input with a target, a year of history and a fresh sync. All figures invented. */
function input(over: Partial<MonthOutlookInput> = {}): MonthOutlookInput {
  return {
    month: { year: 2026, month: 6 },
    today: "2026-06-15",
    now: NOW,
    target: 6000,
    rows: [],
    recurring: [],
    history: [
      { month: { year: 2026, month: 3 }, expenses: 4800 },
      { month: { year: 2026, month: 4 }, expenses: 5100 },
      { month: { year: 2026, month: 5 }, expenses: 5400 },
    ],
    historyCompleteSince: "2025-06-01",
    lastSuccessfulSyncAt: new Date("2026-06-15T06:00:00Z"),
    credentialCount: 2,
    sync: { running: false, banksDone: 0 },
    ...over,
  };
}

let nextId = 0;
function row(over: Partial<OutlookRow> & Pick<OutlookRow, "date" | "chargedAmount">): OutlookRow {
  nextId += 1;
  return {
    id: `row-${nextId}`,
    description: `Invented Shop ${nextId}`,
    categoryType: "expense",
    reconciliationRole: null,
    ...over,
  };
}

/** An expense outflow of `amount` shekels on `date`. */
const spend = (date: string, amount: number, over: Partial<OutlookRow> = {}) =>
  row({ date, chargedAmount: -amount, ...over });

describe("monthOutlook — connection states", () => {
  it("is no-connection when no bank is connected", () => {
    expect(monthOutlook(input({ credentialCount: 0 }))).toEqual({ state: "no-connection" });
  });

  it("is first-sync with live progress while the first sync runs", () => {
    const outlook = monthOutlook(
      input({ lastSuccessfulSyncAt: null, sync: { running: true, banksDone: 1 } }),
    );
    expect(outlook).toEqual({
      state: "first-sync",
      progress: { running: true, banksDone: 1, banksTotal: 2 },
    });
  });

  it("stays first-sync, not running, when a bank is connected but no sync has succeeded yet", () => {
    const outlook = monthOutlook(input({ lastSuccessfulSyncAt: null }));
    expect(outlook).toEqual({
      state: "first-sync",
      progress: { running: false, banksDone: 0, banksTotal: 2 },
    });
  });

  it("leaves first-sync once any sync has succeeded, even while another runs", () => {
    const outlook = monthOutlook(input({ sync: { running: true, banksDone: 0 } }));
    expect(outlook.state).toBe("active");
  });
});

const due = (
  expectedDate: string,
  amount: number,
  arrived = false,
  cadence: "monthly" | "quarterly" | "annual" = "monthly",
) => {
  nextId += 1;
  return {
    id: `series-${nextId}`,
    expectedDate,
    amount,
    arrived,
    awaitingCategory: false,
    cadence,
  };
};

describe("monthOutlook — what's left", () => {
  it("remaining is target minus spent minus recurring still due", () => {
    const outlook = monthOutlook(
      input({
        rows: [spend("2026-06-03", 1000), spend("2026-06-10", 500)],
        recurring: [due("2026-06-20", 300), due("2026-06-01", 200, true)],
      }),
    );
    expect(outlook).toMatchObject({
      state: "active",
      target: 6000,
      spent: 1500,
      dueRecurring: 300,
      remaining: 4200,
      overBy: null,
    });
  });

  it("overspent: remaining stays negative and overBy is the positive overage", () => {
    const outlook = monthOutlook(
      input({
        target: 2000,
        rows: [spend("2026-06-05", 1800)],
        recurring: [due("2026-06-25", 500)],
      }),
    );
    expect(outlook).toMatchObject({ remaining: -300, overBy: 300, perDay: 0 });
  });

  it("is not overspent at exactly the target", () => {
    const outlook = monthOutlook(input({ target: 1000, rows: [spend("2026-06-05", 1000)] }));
    expect(outlook).toMatchObject({ remaining: 0, overBy: null, perDay: 0 });
  });

  describe("per day = remaining ÷ days left including today", () => {
    const at = (today: string) =>
      monthOutlook(input({ today, target: 3000, rows: [spend("2026-06-01", 600)] }));

    it("on day 1 spreads over the whole month", () => {
      expect(at("2026-06-01")).toMatchObject({ remaining: 2400, daysLeft: 30, perDay: 80 });
    });

    it("mid-month counts today as a day left", () => {
      expect(at("2026-06-15")).toMatchObject({ remaining: 2400, daysLeft: 16, perDay: 150 });
    });

    it("on the last day is everything that is left", () => {
      expect(at("2026-06-30")).toMatchObject({ remaining: 2400, daysLeft: 1, perDay: 2400 });
    });
  });

  describe("recurring still due", () => {
    it("counts a charge past its expected date that hasn't arrived as due, marked late", () => {
      const late = due("2026-06-10", 250);
      const latePriorMonth = due("2026-05-29", 100);
      const upcoming = due("2026-06-28", 400);
      const outlook = monthOutlook(input({ recurring: [late, latePriorMonth, upcoming] }));
      expect(outlook).toMatchObject({
        dueRecurring: 750,
        remaining: 5250,
        dueCharges: expect.arrayContaining([
          { ...late, late: true },
          { ...latePriorMonth, late: true },
          { ...upcoming, late: false },
        ]),
      });
    });

    it("leaves out charges that arrived and charges expected after the month", () => {
      const outlook = monthOutlook(
        input({ recurring: [due("2026-06-02", 300, true), due("2026-07-01", 300)] }),
      );
      expect(outlook).toMatchObject({ dueRecurring: 0, dueCharges: [], remaining: 6000 });
    });
  });
});

describe("monthOutlook — what counts as spent", () => {
  const spentOf = (rows: OutlookRow[], today = "2026-06-15") =>
    (monthOutlook(input({ rows, today })) as { spent: number }).spent;

  it("excludes rows dated after today until their date", () => {
    const rows = [spend("2026-06-10", 100), spend("2026-06-20", 900)];
    expect(spentOf(rows, "2026-06-15")).toBe(100);
    expect(spentOf(rows, "2026-06-20")).toBe(1000);
  });

  // The import lifecycle supersedes and sweeps pending rows (CONTEXT.md
  // "pending lifecycle"), so the outlook reads no status at all: a stored row
  // beside a same-looking one — posted or still pending — is a repeat purchase.
  it("counts a repeat purchase of the same amount and description twice", () => {
    const description = "Invented Coffee";
    const rows = [
      spend("2026-06-08", 120, { description }),
      spend("2026-06-10", 120, { description }),
    ];
    expect(spentOf(rows)).toBe(240);
  });

  it("counts a charge once after its posted version superseded the pending row in place", () => {
    // The importer's takeover rewrites the pending row into the posted one: one
    // stored row, so one charge — the outlook only ever sees the result.
    const posted = spend("2026-06-10", 120, {
      id: "row-taken-over",
      description: "Invented Bakery",
    });
    expect(spentOf([posted])).toBe(120);
  });

  it("counts three same-looking rows within a week as three purchases", () => {
    const description = "Invented Coffee";
    const rows = [
      spend("2026-06-08", 120, { description }),
      spend("2026-06-09", 120, { description }),
      spend("2026-06-10", 120, { description }),
    ];
    expect(spentOf(rows)).toBe(360);
  });

  it("excludes a row reconciliation flagged as the settlement lump", () => {
    const rows = [
      spend("2026-06-02", 3000, { reconciliationRole: "settlement_lump" }),
      spend("2026-06-03", 80, { reconciliationRole: "settlement_detail" }),
    ];
    expect(spentOf(rows)).toBe(80);
  });

  it.each([
    "דמי ניהול חשבון 2026",
    "חיוב ישיר ביטוח",
    "שכר דירה 1234",
    "ארנונה 10/2026",
    "הלוואה 5555 החזר",
  ])("counts the unflagged bank expense %s, whatever its description looks like", (d) => {
    expect(spentOf([spend("2026-06-02", 250, { description: d })])).toBe(250);
  });

  it("ignores transfer, ignore, investment, income and uncategorized rows", () => {
    const rows = [
      spend("2026-06-02", 200),
      spend("2026-06-03", 1000, { categoryType: "transfer" }),
      spend("2026-06-04", 50, { categoryType: "ignore" }),
      spend("2026-06-05", 700, { categoryType: "investment" }),
      spend("2026-06-06", 30, { categoryType: null }),
      row({ date: "2026-06-07", chargedAmount: 9000, categoryType: "income" }),
    ];
    expect(spentOf(rows)).toBe(200);
  });

  it("nets refunds against spend instead of adding them", () => {
    const rows = [spend("2026-06-02", 500), row({ date: "2026-06-09", chargedAmount: 200 })];
    expect(spentOf(rows)).toBe(300);
  });
});

describe("monthOutlook — without a target", () => {
  it("is no-target with the usual month and a rounded suggested target", () => {
    const outlook = monthOutlook(input({ target: null, rows: [spend("2026-06-03", 400)] }));
    expect(outlook).toEqual({
      state: "no-target",
      spent: 400,
      usualMonth: 5100,
      suggestedTarget: 5500,
      asOf: new Date("2026-06-15T06:00:00Z"),
      stale: false,
    });
  });

  it("is thin-history when there is no prior month to learn from", () => {
    const outlook = monthOutlook(
      input({
        target: null,
        history: [],
        historyCompleteSince: "2026-06-01",
        rows: [spend("2026-06-03", 400)],
      }),
    );
    expect(outlook).toEqual({
      state: "thin-history",
      spent: 400,
      asOf: new Date("2026-06-15T06:00:00Z"),
      stale: false,
    });
  });

  it("treats a prior month the data only partly covers as thin history", () => {
    const outlook = monthOutlook(
      input({
        target: null,
        history: [{ month: { year: 2026, month: 5 }, expenses: 2000 }],
        historyCompleteSince: "2026-05-10",
      }),
    );
    expect(outlook.state).toBe("thin-history");
  });

  it("averages only the latest three complete months that had expense data", () => {
    const outlook = monthOutlook(
      input({
        target: null,
        history: [
          { month: { year: 2026, month: 1 }, expenses: 9000 },
          { month: { year: 2026, month: 2 }, expenses: 3000 },
          { month: { year: 2026, month: 3 }, expenses: 0 },
          { month: { year: 2026, month: 4 }, expenses: 4000 },
          { month: { year: 2026, month: 5 }, expenses: 5000 },
        ],
      }),
    );
    expect(outlook).toMatchObject({ usualMonth: 4000 });
  });

  it.each([
    [730, 800],
    [5000, 5000],
    [5100, 5500],
    [12300, 13000],
  ])("rounds a usual month of %d up to a suggested target of %d", (usual, suggested) => {
    const outlook = monthOutlook(
      input({ target: null, history: [{ month: { year: 2026, month: 5 }, expenses: usual }] }),
    );
    expect(outlook).toMatchObject({ usualMonth: usual, suggestedTarget: suggested });
  });
});

describe("monthOutlook — freshness", () => {
  const syncedAgo = (hours: number) =>
    monthOutlook(
      input({ lastSuccessfulSyncAt: new Date(NOW.getTime() - hours * 60 * 60 * 1000) }),
    ) as { stale: boolean; asOf: Date };

  it("is fresh within two days of the last successful sync", () => {
    expect(syncedAgo(47).stale).toBe(false);
    expect(syncedAgo(48).stale).toBe(false);
  });

  it("is stale once the last successful sync is older than two days", () => {
    const outlook = syncedAgo(49);
    expect(outlook.stale).toBe(true);
    expect(outlook.asOf).toEqual(new Date(NOW.getTime() - 49 * 60 * 60 * 1000));
  });
});

describe("monthOutlook — projection", () => {
  const flatHistory = (expenses: number) => [
    { month: { year: 2026, month: 3 }, expenses },
    { month: { year: 2026, month: 4 }, expenses },
    { month: { year: 2026, month: 5 }, expenses },
  ];

  it("is null with no basis or crossing date when history is thin", () => {
    const outlook = monthOutlook(
      input({ history: [], historyCompleteSince: "2026-06-01", rows: [spend("2026-06-03", 4000)] }),
    );
    expect(outlook).toMatchObject({
      state: "active",
      projection: null,
      projectionBasis: null,
      crossingDate: null,
    });
  });

  it("reports as basis whichever side contributes more to the projected spend", () => {
    // Usual month 3000 → 100/day. Steady 150/day this month.
    const basisOn = (day: number) =>
      (
        monthOutlook(
          input({
            today: `2026-06-${String(day).padStart(2, "0")}`,
            history: flatHistory(3000),
            rows: [spend("2026-06-01", 150 * day)],
          }),
        ) as { projectionBasis: string }
      ).projectionBasis;
    expect(basisOn(3)).toBe("usual-month");
    expect(basisOn(10)).toBe("this-month-pace");
    expect(basisOn(20)).toBe("this-month-pace");
  });

  it("does not let one large first-day purchase drive the projection", () => {
    // Day 1: a 2000 purchase is not a 2000/day pace. The usual month (100/day) dominates.
    const outlook = monthOutlook(
      input({
        today: "2026-06-01",
        target: 6000,
        history: flatHistory(3000),
        rows: [spend("2026-06-01", 2000)],
      }),
    );
    const active = outlook as Extract<typeof outlook, { state: "active" }>;
    expect(active.projectionBasis).toBe("usual-month");
    expect(active.crossingDate).toBeNull();
    expect(active.projection!.total).toBeLessThan(6000);
  });

  it("takes only monthly recurring charges out of the usual month's variable rate", () => {
    // Usual month 3000 holds one monthly 300 rent, so 2700 variable → 90/day; the
    // quarterly 900 due this month is not in a usual month. Day 7 blends 90/day
    // history with 0 variable pace: 45/day × 23 days, plus the 900 on the 25th.
    const outlook = monthOutlook(
      input({
        today: "2026-06-07",
        history: flatHistory(3000),
        rows: [spend("2026-06-01", 300)],
        recurring: [due("2026-06-01", 300, true), due("2026-06-25", 900, false, "quarterly")],
      }),
    );
    expect(outlook).toMatchObject({ projection: { total: 2235 } });
  });

  it("states no crossing date when the projection lands exactly on the target", () => {
    // Pace 2000 ÷ 20 = 100/day × 10 days → exactly 3000.
    const outlook = monthOutlook(
      input({ today: "2026-06-20", target: 3000, rows: [spend("2026-06-12", 2000)] }),
    );
    expect(outlook).toMatchObject({ projection: { total: 3000 }, crossingDate: null });
  });

  it("blends history and pace half-and-half on day 7", () => {
    // usual-month rate 3000 ÷ 30 = 100/day; pace 1400 ÷ 7 = 200/day; blend 150/day × 23 days left.
    const outlook = monthOutlook(
      input({
        today: "2026-06-07",
        history: flatHistory(3000),
        rows: [spend("2026-06-02", 1400)],
      }),
    );
    expect(outlook).toMatchObject({ projection: { total: 4850 } });
  });

  it("projects variable pace only, placing recurring charges on their own dates", () => {
    // Pace (3000 − 1000 arrived rent) ÷ 20 days = 100/day for 10 days, plus 500 due on the 25th.
    const outlook = monthOutlook(
      input({
        today: "2026-06-20",
        target: 4000,
        rows: [spend("2026-06-01", 1000), spend("2026-06-12", 2000)],
        recurring: [due("2026-06-01", 1000, true), due("2026-06-25", 500)],
      }),
    );
    const active = outlook as Extract<typeof outlook, { state: "active" }>;
    expect(active.projection?.total).toBe(4500);
    expect(active.projection?.projected).toEqual([
      3000, 3100, 3200, 3300, 3400, 4000, 4100, 4200, 4300, 4400, 4500,
    ]);
    expect(active.projection?.actual).toHaveLength(20);
    expect(active.projection?.actual[0]).toBe(1000);
    expect(active.projection?.actual[19]).toBe(3000);
  });

  it("states the first day the projection exceeds the target", () => {
    const outlook = monthOutlook(
      input({
        today: "2026-06-20",
        target: 4000,
        rows: [spend("2026-06-01", 1000), spend("2026-06-12", 2000)],
        recurring: [due("2026-06-01", 1000, true), due("2026-06-25", 500)],
      }),
    );
    expect(outlook).toMatchObject({ crossingDate: "2026-06-26" });
  });

  it("has no crossing date when the projection stays under the target", () => {
    const outlook = monthOutlook(
      input({ today: "2026-06-20", target: 9000, rows: [spend("2026-06-12", 2000)] }),
    );
    expect(outlook).toMatchObject({ crossingDate: null });
    expect((outlook as { projection: unknown }).projection).not.toBeNull();
  });

  it("has no crossing date once spend is already over the target", () => {
    const outlook = monthOutlook(
      input({ today: "2026-06-20", target: 1000, rows: [spend("2026-06-12", 2000)] }),
    );
    expect(outlook).toMatchObject({ overBy: 1000, crossingDate: null });
  });

  it("lands a late charge on the last day itself when no day is left", () => {
    const outlook = monthOutlook(
      input({
        today: "2026-06-30",
        rows: [spend("2026-06-12", 2000)],
        recurring: [due("2026-06-20", 300)],
      }),
    );
    expect(outlook).toMatchObject({ projection: { projected: [2300], total: 2300 } });
  });

  it("lands a charge late since last month on the next day, and the crossing follows it", () => {
    // Pace 2000 ÷ 20 days = 100/day; the 500 owed since May 29 lands on the 21st.
    const outlook = monthOutlook(
      input({
        today: "2026-06-20",
        target: 2500,
        rows: [spend("2026-06-12", 2000)],
        recurring: [due("2026-05-29", 500)],
      }),
    );
    const active = outlook as Extract<typeof outlook, { state: "active" }>;
    expect(active.projection?.projected.slice(0, 3)).toEqual([2000, 2600, 2700]);
    expect(active.crossingDate).toBe("2026-06-21");
  });

  it("states no crossing date once spent plus what's due is already over the target", () => {
    const outlook = monthOutlook(
      input({
        today: "2026-06-20",
        target: 2400,
        rows: [spend("2026-06-12", 2000)],
        recurring: [due("2026-06-25", 500)],
      }),
    );
    expect(outlook).toMatchObject({ overBy: 100, crossingDate: null });
  });
});

describe("monthOutlook — closed month", () => {
  const may = (over: Partial<MonthOutlookInput>) =>
    monthOutlook(
      input({
        month: { year: 2026, month: 5 },
        rows: [
          row({ date: "2026-05-01", chargedAmount: 10000, categoryType: "income" }),
          spend("2026-05-10", 7500),
          row({ date: "2026-05-20", chargedAmount: 500 }),
          spend("2026-05-21", 2000, { categoryType: "investment" }),
        ],
        ...over,
      }),
    );

  it("reports income, expenses, net and the overage against the target", () => {
    expect(may({ target: 6000 })).toEqual({
      state: "closed",
      income: 10000,
      expenses: 7000,
      net: 3000,
      target: 6000,
      overBy: 1000,
    });
  });

  it("has no overage when the month stayed under the target", () => {
    expect(may({ target: 8000 })).toMatchObject({ target: 8000, overBy: null });
  });

  it("reports the month without a target", () => {
    expect(may({ target: null })).toEqual({
      state: "closed",
      income: 10000,
      expenses: 7000,
      net: 3000,
      target: null,
      overBy: null,
    });
  });

  it("leaves a flagged settlement lump still typed as an expense out of the month's expenses", () => {
    const lump = spend("2026-05-15", 4000, { reconciliationRole: "settlement_lump" });
    const outlook = monthOutlook(
      input({
        month: { year: 2026, month: 5 },
        target: null,
        rows: [spend("2026-05-10", 7500), lump],
      }),
    );
    expect(outlook).toMatchObject({ state: "closed", expenses: 7500 });
  });
});

describe("monthOutlook — month bounds", () => {
  it("refuses a month that hasn't started", () => {
    expect(() => monthOutlook(input({ month: { year: 2026, month: 7 } }))).toThrow(RangeError);
  });
});
