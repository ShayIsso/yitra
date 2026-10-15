import { describe, it, expect } from "vitest";
import { importTransaction } from "../import";
import type { Categorization, StoredTransaction } from "../import";
import { importAccountTransactions } from "../account-import";
import { planPendingSweep } from "../sweep";
import type { ScrapedTransaction } from "@/lib/scraper/types";
import { createMemoryStore, createMemorySweepStore } from "./memory-store";

const noCategorize = async (): Promise<Categorization> => ({ categoryId: null, source: null });

/** The library emits full ISO timestamps, not calendar dates. */
function ts(day: string, time = "22:00:00.000Z"): string {
  return `${day}T${time}`;
}

function shiftIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function posted(overrides: Partial<ScrapedTransaction> = {}): ScrapedTransaction {
  return {
    externalId: "ext-9",
    date: ts("2024-03-10"),
    processedDate: ts("2024-03-12"),
    description: "Fuel Depot",
    memo: null,
    originalAmount: -80,
    originalCurrency: "ILS",
    chargedAmount: -80,
    chargedCurrency: "ILS",
    type: "normal",
    installmentNumber: null,
    installmentTotal: null,
    status: "completed",
    ...overrides,
  };
}

function pendingRow(overrides: Partial<StoredTransaction> = {}): StoredTransaction {
  return {
    id: "p1",
    bankAccountId: "acct-1",
    externalId: null,
    date: "2024-03-10",
    processedDate: "2024-03-10",
    description: "Fuel Depot",
    chargedAmount: -80,
    status: "pending",
    categoryId: "cat-fuel",
    ...overrides,
  };
}

describe("pending takeover by a posted transaction", () => {
  it("updates the pending row in place when scraped dates are full timestamps", async () => {
    const store = createMemoryStore([pendingRow()]);
    const result = await importTransaction(posted(), "acct-1", store, noCategorize);
    expect(result).toBe("updated");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      id: "p1",
      status: "completed",
      externalId: "ext-9",
      date: "2024-03-10",
    });
  });

  it("handles a timestamp whose UTC date differs from the local calendar day", async () => {
    const store = createMemoryStore([pendingRow({ date: "2024-03-10" })]);
    const result = await importTransaction(
      posted({ date: "2024-03-09T21:00:00.000Z" }),
      "acct-1",
      store,
      noCategorize,
    );
    expect(result).toBe("updated");
    expect(store.rows).toHaveLength(1);
  });

  it.each([1, 3, 7, -1, -4, -7])(
    "takes over a pending row whose date moved by %i days",
    async (shift) => {
      const store = createMemoryStore([pendingRow({ date: shiftIso("2024-03-10", shift) })]);
      const result = await importTransaction(posted(), "acct-1", store, noCategorize);
      expect(result).toBe("updated");
      expect(store.rows).toHaveLength(1);
      expect(store.rows[0].date).toBe("2024-03-10");
    },
  );

  it("does not take over a pending row more than 7 days away", async () => {
    const store = createMemoryStore([pendingRow({ date: "2024-03-02" })]);
    const result = await importTransaction(posted(), "acct-1", store, noCategorize);
    expect(result).toBe("inserted");
    expect(store.rows).toHaveLength(2);
  });

  it("takes over when the amount changed but the description matches", async () => {
    const store = createMemoryStore([pendingRow({ chargedAmount: 0 })]);
    const result = await importTransaction(posted(), "acct-1", store, noCategorize);
    expect(result).toBe("updated");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].chargedAmount).toBe(-80);
  });

  it("takes over when the description changed to the same merchant and the amount matches", async () => {
    const store = createMemoryStore([pendingRow({ description: "FUEL DEPOT TLV 123" })]);
    const result = await importTransaction(posted(), "acct-1", store, noCategorize);
    expect(result).toBe("updated");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].description).toBe("Fuel Depot");
  });

  it("does not take over on amount alone when the merchant differs", async () => {
    const store = createMemoryStore([pendingRow({ description: "Cafe Nova" })]);
    const result = await importTransaction(posted(), "acct-1", store, noCategorize);
    expect(result).toBe("inserted");
    expect(store.rows).toHaveLength(2);
  });

  it("does not take over when both amount and description differ", async () => {
    const store = createMemoryStore([pendingRow({ description: "Other", chargedAmount: -5 })]);
    const result = await importTransaction(posted(), "acct-1", store, noCategorize);
    expect(result).toBe("inserted");
    expect(store.rows).toHaveLength(2);
  });

  it("prefers the pending row with the closest date within a match tier", async () => {
    const store = createMemoryStore([
      pendingRow({ id: "far", date: "2024-03-05" }),
      pendingRow({ id: "near", date: "2024-03-09" }),
    ]);
    await importTransaction(posted(), "acct-1", store, noCategorize);
    expect(store.rows.find((r) => r.id === "near")?.status).toBe("completed");
    expect(store.rows.find((r) => r.id === "far")?.status).toBe("pending");
  });

  it("ranks match strength before date gap", async () => {
    const store = createMemoryStore([
      pendingRow({ id: "cafe", description: "Cafe", chargedAmount: -20, date: "2024-03-10" }),
      pendingRow({ id: "bakery", description: "Bakery", chargedAmount: -20, date: "2024-03-07" }),
    ]);
    await importTransaction(
      posted({ description: "Bakery", chargedAmount: -20, date: ts("2024-03-10") }),
      "acct-1",
      store,
      noCategorize,
    );
    expect(store.rows.find((r) => r.id === "bakery")?.status).toBe("completed");
    expect(store.rows.find((r) => r.id === "cafe")?.status).toBe("pending");
  });

  it("keeps the pending row's category and never writes category or custom description", async () => {
    const store = createMemoryStore([pendingRow()]);
    const written: string[] = [];
    const original = store.update;
    store.update = async (id, changes) => {
      written.push(...Object.keys(changes));
      return original(id, changes);
    };
    await importTransaction(posted(), "acct-1", store, noCategorize);
    expect(store.rows[0].categoryId).toBe("cat-fuel");
    expect(written).not.toContain("categoryId");
    expect(written).not.toContain("categorySource");
    expect(written).not.toContain("customDescription");
  });

  it("keeps two genuine completed same-amount charges", async () => {
    const store = createMemoryStore();
    await importTransaction(posted({ externalId: "a" }), "acct-1", store, noCategorize);
    const second = await importTransaction(
      posted({ externalId: "b", date: ts("2024-03-13") }),
      "acct-1",
      store,
      noCategorize,
    );
    expect(second).toBe("inserted");
    expect(store.rows).toHaveLength(2);
  });

  it("ignores completed rows and rows already carrying an id", async () => {
    const store = createMemoryStore([
      pendingRow({ id: "done", status: "completed", externalId: null }),
      pendingRow({ id: "other-id", externalId: "ext-other" }),
    ]);
    const result = await importTransaction(posted(), "acct-1", store, noCategorize);
    expect(result).toBe("inserted");
    expect(store.rows).toHaveLength(3);
  });

  it("ignores pending rows of another account", async () => {
    const store = createMemoryStore([pendingRow({ bankAccountId: "acct-2" })]);
    const result = await importTransaction(posted(), "acct-1", store, noCategorize);
    expect(result).toBe("inserted");
  });

  it("never lets an incoming pending transaction take over another pending row", async () => {
    const store = createMemoryStore([pendingRow()]);
    const result = await importTransaction(
      posted({ externalId: null, status: "pending", date: ts("2024-03-11") }),
      "acct-1",
      store,
      noCategorize,
    );
    expect(result).toBe("inserted");
    expect(store.rows).toHaveLength(2);
  });

  it("is idempotent when the same scrape is imported twice", async () => {
    const store = createMemoryStore([pendingRow()]);
    await importTransaction(posted(), "acct-1", store, noCategorize);
    const again = await importTransaction(posted(), "acct-1", store, noCategorize);
    expect(again).toBe("skipped");
    expect(store.rows).toHaveLength(1);
  });
});

describe("importAccountTransactions", () => {
  const WINDOW = "2024-01-01";
  const importWith = (
    rows: StoredTransaction[],
    transactions: ScrapedTransaction[],
    windowStart: string | null = WINDOW,
  ) => {
    const store = createMemoryStore(rows);
    return {
      store,
      run: () =>
        importAccountTransactions({
          transactions,
          bankAccountId: "acct-1",
          windowStart: windowStart ?? undefined,
          store,
          sweepStore: createMemorySweepStore(store.rows),
          categorize: noCategorize,
        }),
    };
  };
  const stillPending = (overrides: Partial<ScrapedTransaction> = {}) =>
    posted({ externalId: null, status: "pending", ...overrides });
  /** A live pending charge unrelated to the rows under test: satisfies the sweep guard. */
  const livePending = () =>
    stillPending({ description: "Live Charge", chargedAmount: -1, date: ts("2024-03-20") });

  describe("resolution order", () => {
    it("resolves still-pending rows before completed ones, whatever the scrape order", async () => {
      const { store, run } = importWith(
        [
          pendingRow({ id: "P1", date: "2024-10-01", categoryId: "cat-a" }),
          pendingRow({ id: "P2", date: "2024-10-08", categoryId: "cat-b" }),
        ],
        [
          posted({ externalId: "c1", date: ts("2024-10-06") }),
          stillPending({ date: ts("2024-10-08") }),
        ],
      );
      const counts = await run();
      expect(counts).toMatchObject({ updated: 1, skipped: 1, inserted: 0, swept: 0 });
      const p1 = store.rows.find((r) => r.id === "P1");
      const p2 = store.rows.find((r) => r.id === "P2");
      expect(p1).toMatchObject({ status: "completed", externalId: "c1", categoryId: "cat-a" });
      expect(p2).toMatchObject({ status: "pending", externalId: null, categoryId: "cat-b" });
    });
  });

  describe("pending sweep", () => {
    it("deletes an in-window pending row the scrape no longer reports", async () => {
      const { store, run } = importWith(
        [pendingRow({ id: "gone", date: "2024-02-10", description: "Cafe", chargedAmount: -9 })],
        [livePending()],
      );
      const counts = await run();
      expect(counts.swept).toBe(1);
      expect(store.rows.map((r) => r.id)).not.toContain("gone");
    });

    it("keeps a pending row the scrape re-reports", async () => {
      const { store, run } = importWith([pendingRow()], [stillPending()]);
      const counts = await run();
      expect(counts).toMatchObject({ skipped: 1, swept: 0 });
      expect(store.rows.map((r) => r.id)).toEqual(["p1"]);
    });

    it("keeps a pending row that was taken over by a posted transaction", async () => {
      const { store, run } = importWith([pendingRow()], [posted(), livePending()]);
      const counts = await run();
      expect(counts).toMatchObject({ updated: 1, swept: 0 });
      expect(store.rows.map((r) => r.id)).toContain("p1");
    });

    it("sweeps nothing when the scrape reported completed rows but zero pending", async () => {
      const { store, run } = importWith(
        [pendingRow({ id: "orphan", date: "2024-02-10", description: "Cafe", chargedAmount: -9 })],
        [posted({ externalId: "e1", description: "Bakery", chargedAmount: -3 })],
      );
      const counts = await run();
      expect(counts.swept).toBe(0);
      expect(store.rows.map((r) => r.id)).toContain("orphan");
    });

    it("sweeps nothing when the scrape returned no transactions", async () => {
      const { store, run } = importWith([pendingRow({ id: "kept", date: "2024-02-10" })], []);
      const counts = await run();
      expect(counts.swept).toBe(0);
      expect(store.rows).toHaveLength(1);
    });

    it("leaves a pending row older than the scrape window untouched", async () => {
      const { store, run } = importWith(
        [pendingRow({ id: "old", date: "2023-12-31", description: "Cafe", chargedAmount: -9 })],
        [livePending()],
      );
      const counts = await run();
      expect(counts.swept).toBe(0);
      expect(store.rows.map((r) => r.id)).toContain("old");
    });

    it("leaves other accounts' pending rows untouched", async () => {
      const { store, run } = importWith(
        [
          pendingRow({
            id: "other-acct",
            bankAccountId: "acct-2",
            date: "2024-02-10",
            description: "Cafe",
            chargedAmount: -9,
          }),
        ],
        [livePending()],
      );
      const counts = await run();
      expect(counts.swept).toBe(0);
      expect(store.rows.map((r) => r.id)).toContain("other-acct");
    });

    it("leaves completed rows untouched", async () => {
      const { store, run } = importWith(
        [
          pendingRow({
            id: "done",
            status: "completed",
            externalId: "x",
            date: "2024-02-10",
            description: "Cafe",
            chargedAmount: -9,
          }),
        ],
        [livePending()],
      );
      const counts = await run();
      expect(counts.swept).toBe(0);
      expect(store.rows.map((r) => r.id)).toContain("done");
    });

    it("sweeps nothing when the import throws midway", async () => {
      const store = createMemoryStore([
        pendingRow({ id: "gone", date: "2024-02-10", description: "Cafe", chargedAmount: -9 }),
      ]);
      store.insert = async () => {
        throw new Error("db down");
      };
      await expect(
        importAccountTransactions({
          transactions: [livePending()],
          bankAccountId: "acct-1",
          windowStart: WINDOW,
          store,
          sweepStore: createMemorySweepStore(store.rows),
          categorize: noCategorize,
        }),
      ).rejects.toThrow("db down");
      expect(store.rows).toHaveLength(1);
    });

    it("sweeps nothing when no window start is given", async () => {
      const { store, run } = importWith(
        [pendingRow({ date: "2024-02-10", description: "Cafe", chargedAmount: -9 })],
        [livePending()],
        null,
      );
      const counts = await run();
      expect(counts.swept).toBe(0);
      expect(store.rows).toHaveLength(2);
    });

    it("is idempotent when the same scrape is imported twice", async () => {
      const txs = [posted(), livePending()];
      const { store, run } = importWith(
        [
          pendingRow(),
          pendingRow({ id: "gone", date: "2024-02-10", description: "Cafe", chargedAmount: -9 }),
        ],
        txs,
      );
      await run();
      const snapshot = JSON.stringify(store.rows);
      const second = await run();
      expect(second).toMatchObject({ inserted: 0, updated: 0, swept: 0 });
      expect(JSON.stringify(store.rows)).toBe(snapshot);
    });
  });

  describe("healing pending rows older than the window", () => {
    const oldPending = (overrides: Partial<StoredTransaction> = {}) =>
      pendingRow({
        id: "old",
        date: "2023-12-20",
        description: "Cafe",
        chargedAmount: -9,
        categoryId: "cat-food",
        categorySource: "user",
        customDescription: "Morning coffee",
        ...overrides,
      });
    const twin = (overrides: Partial<StoredTransaction> = {}) =>
      pendingRow({
        id: "twin",
        status: "completed",
        externalId: "t-1",
        date: "2023-12-22",
        description: "Cafe",
        chargedAmount: -9,
        categoryId: null,
        categorySource: null,
        customDescription: null,
        ...overrides,
      });

    it("removes an old pending row with an exact completed twin and carries its category over", async () => {
      const { store, run } = importWith([oldPending(), twin()], []);
      const counts = await run();
      expect(counts.swept).toBe(1);
      expect(store.rows.map((r) => r.id)).toEqual(["twin"]);
      expect(store.rows[0]).toMatchObject({
        categoryId: "cat-food",
        categorySource: "user",
        customDescription: "Morning coffee",
      });
    });

    it("keeps an old pending row that has no twin", async () => {
      const { store, run } = importWith([oldPending()], []);
      await run();
      expect(store.rows.map((r) => r.id)).toEqual(["old"]);
    });

    it.each([
      ["amount", { chargedAmount: -10 }],
      ["description", { description: "Bakery" }],
      ["date beyond 7 days", { date: "2023-12-29" }],
    ])("keeps an old pending row whose twin differs in %s", async (_name, change) => {
      const { store, run } = importWith([oldPending(), twin(change)], []);
      await run();
      expect(store.rows.map((r) => r.id).sort()).toEqual(["old", "twin"]);
    });
  });
});

describe("planPendingSweep", () => {
  const base = { windowStart: "2024-01-01", reportedPending: true, seenIds: new Set<string>() };
  const completed = (o: Partial<StoredTransaction> = {}) =>
    pendingRow({
      id: "c",
      status: "completed",
      externalId: "x",
      categoryId: null,
      categorySource: null,
      ...o,
    });

  it("carries a trusted category onto an uncategorised twin", () => {
    const plan = planPendingSweep({
      ...base,
      pending: [pendingRow({ categorySource: "rule" })],
      completed: [completed()],
    });
    expect(plan.carryovers).toEqual([
      { completedId: "c", categoryId: "cat-fuel", categorySource: "rule", customDescription: null },
    ]);
  });

  it("overwrites an ai-sourced twin category", () => {
    const plan = planPendingSweep({
      ...base,
      pending: [pendingRow({ categorySource: "user" })],
      completed: [completed({ categoryId: "cat-ai", categorySource: "ai" })],
    });
    expect(plan.carryovers[0]).toMatchObject({ categoryId: "cat-fuel", categorySource: "user" });
  });

  it.each(["user", "rule", "memory"] as const)(
    "never overwrites a %s-sourced twin category",
    (source) => {
      const plan = planPendingSweep({
        ...base,
        pending: [pendingRow({ categorySource: "user" })],
        completed: [completed({ categoryId: "cat-keep", categorySource: source })],
      });
      expect(plan.deleteIds).toEqual(["p1"]);
      expect(plan.carryovers).toEqual([]);
    },
  );

  it("does not carry an ai-sourced category", () => {
    const plan = planPendingSweep({
      ...base,
      pending: [pendingRow({ categorySource: "ai" })],
      completed: [completed()],
    });
    expect(plan.carryovers).toEqual([]);
  });

  it("carries custom_description only when the twin has none", () => {
    const withCustom = pendingRow({ categoryId: null, customDescription: "Mine" });
    expect(
      planPendingSweep({ ...base, pending: [withCustom], completed: [completed()] }).carryovers[0],
    ).toMatchObject({ customDescription: "Mine", categoryId: null });
    expect(
      planPendingSweep({
        ...base,
        pending: [withCustom],
        completed: [completed({ customDescription: "Theirs" })],
      }).carryovers,
    ).toEqual([]);
  });

  it("uses each completed twin for one pending row only", () => {
    const plan = planPendingSweep({
      ...base,
      pending: [
        pendingRow({ id: "a", categorySource: "user" }),
        pendingRow({ id: "b", categorySource: "user", categoryId: "cat-other" }),
      ],
      completed: [completed()],
    });
    expect(plan.deleteIds).toEqual(["a", "b"]);
    expect(plan.carryovers).toHaveLength(1);
  });

  it("releases the reconciliation groups of deleted rows", () => {
    const plan = planPendingSweep({
      ...base,
      pending: [pendingRow({ reconciliationGroupId: "g1" }), pendingRow({ id: "p2" })],
      completed: [],
    });
    expect(plan.deleteIds).toEqual(["p1", "p2"]);
    expect(plan.releaseGroupIds).toEqual(["g1"]);
  });

  it("never deletes a row this scrape resolved to, even pre-window with an exact twin", () => {
    const plan = planPendingSweep({
      ...base,
      seenIds: new Set(["p1"]),
      pending: [pendingRow({ date: "2023-12-20" })],
      completed: [completed({ date: "2023-12-22" })],
    });
    expect(plan.deleteIds).toEqual([]);
  });

  it("deletes an unseen in-window row with an exact twin even when no pending was reported", () => {
    const plan = planPendingSweep({
      ...base,
      reportedPending: false,
      pending: [pendingRow({ date: "2024-02-10" })],
      completed: [completed({ date: "2024-02-12" })],
    });
    expect(plan.deleteIds).toEqual(["p1"]);
  });

  it("keeps an unseen in-window row without a twin when no pending was reported", () => {
    const plan = planPendingSweep({
      ...base,
      reportedPending: false,
      pending: [pendingRow({ date: "2024-02-10" })],
      completed: [],
    });
    expect(plan.deleteIds).toEqual([]);
  });

  it("deletes only one of two pre-window pending rows competing for one twin", () => {
    const plan = planPendingSweep({
      ...base,
      pending: [
        pendingRow({ id: "b", date: "2023-12-21" }),
        pendingRow({ id: "a", date: "2023-12-21" }),
      ],
      completed: [completed({ date: "2023-12-22" })],
    });
    expect(plan.deleteIds).toEqual(["a"]);
  });

  it("pairs twins deterministically whatever the input order", () => {
    const rows = [
      pendingRow({ id: "z", date: "2023-12-20", categoryId: "cat-z", categorySource: "user" }),
      pendingRow({ id: "y", date: "2023-12-20", categoryId: "cat-y", categorySource: "user" }),
    ];
    const args = { ...base, completed: [completed({ date: "2023-12-22" })] };
    const forward = planPendingSweep({ ...args, pending: rows });
    const reversed = planPendingSweep({ ...args, pending: [...rows].reverse() });
    expect(reversed).toEqual(forward);
  });

  it("lists twins that received a category for suggestion superseding", () => {
    const plan = planPendingSweep({
      ...base,
      pending: [pendingRow({ categorySource: "user" })],
      completed: [completed()],
    });
    expect(plan.supersedeSuggestionIds).toEqual(["c"]);
  });

  it("supersedes no suggestions when only a custom description was carried", () => {
    const plan = planPendingSweep({
      ...base,
      pending: [pendingRow({ categoryId: null, customDescription: "Mine" })],
      completed: [completed()],
    });
    expect(plan.supersedeSuggestionIds).toEqual([]);
  });

  it("deletes nothing in-window when no pending was reported", () => {
    const plan = planPendingSweep({
      ...base,
      reportedPending: false,
      pending: [pendingRow()],
      completed: [],
    });
    expect(plan.deleteIds).toEqual([]);
  });
});
