import { describe, it, expect } from "vitest";
import { importTransaction } from "../import";
import type { Categorization, StoredTransaction } from "../import";
import { importAccountTransactions } from "../account-import";
import type { ScrapedTransaction } from "@/lib/scraper/types";
import { createMemoryStore, createMemorySweepStore } from "./memory-store";

const noCategorize = async (): Promise<Categorization> => ({ categoryId: null, source: null });

function shiftIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function posted(overrides: Partial<ScrapedTransaction> = {}): ScrapedTransaction {
  return {
    externalId: "ext-9",
    date: "2024-03-10",
    processedDate: "2024-03-12",
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
  it("updates the pending row in place when date, amount and description match", async () => {
    const store = createMemoryStore([pendingRow()]);
    const result = await importTransaction(posted(), "acct-1", store, noCategorize);
    expect(result).toBe("updated");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      id: "p1",
      status: "completed",
      externalId: "ext-9",
      processedDate: "2024-03-12",
    });
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

  it("takes over when the description changed but the amount matches", async () => {
    const store = createMemoryStore([pendingRow({ description: "FUEL DEPOT TLV 123" })]);
    const result = await importTransaction(posted(), "acct-1", store, noCategorize);
    expect(result).toBe("updated");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].description).toBe("Fuel Depot");
  });

  it("does not take over when both amount and description differ", async () => {
    const store = createMemoryStore([pendingRow({ description: "Other", chargedAmount: -5 })]);
    const result = await importTransaction(posted(), "acct-1", store, noCategorize);
    expect(result).toBe("inserted");
    expect(store.rows).toHaveLength(2);
  });

  it("prefers the pending row with the closest date", async () => {
    const store = createMemoryStore([
      pendingRow({ id: "far", date: "2024-03-05" }),
      pendingRow({ id: "near", date: "2024-03-09" }),
    ]);
    await importTransaction(posted(), "acct-1", store, noCategorize);
    expect(store.rows.find((r) => r.id === "near")?.status).toBe("completed");
    expect(store.rows.find((r) => r.id === "far")?.status).toBe("pending");
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
      posted({ externalId: "b", date: "2024-03-13" }),
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
      posted({ externalId: null, status: "pending", date: "2024-03-11" }),
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

describe("importAccountTransactions pending sweep", () => {
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

  it("deletes an in-window pending row the scrape no longer reports", async () => {
    const { store, run } = importWith(
      [pendingRow({ id: "gone", date: "2024-02-10" })],
      [posted({ externalId: "e1", description: "Cafe", chargedAmount: -9, date: "2024-02-20" })],
    );
    const counts = await run();
    expect(counts.swept).toBe(1);
    expect(store.rows.map((r) => r.id)).not.toContain("gone");
  });

  it("sweeps nothing when the scrape returned no transactions", async () => {
    const { store, run } = importWith([pendingRow({ id: "kept", date: "2024-02-10" })], []);
    const counts = await run();
    expect(counts.swept).toBe(0);
    expect(store.rows).toHaveLength(1);
  });

  it("does not let a completed charge take over a pending row this scrape re-reported", async () => {
    const { store, run } = importWith(
      [pendingRow()],
      [stillPending(), posted({ externalId: "e2", date: "2024-03-07" })],
    );
    const counts = await run();
    expect(counts).toMatchObject({ skipped: 1, inserted: 1, swept: 0 });
    expect(store.rows.filter((r) => r.status === "pending")).toHaveLength(1);
  });

  it("keeps a pending row the scrape re-reports", async () => {
    const { store, run } = importWith([pendingRow()], [stillPending()]);
    const counts = await run();
    expect(counts).toMatchObject({ skipped: 1, swept: 0 });
    expect(store.rows.map((r) => r.id)).toEqual(["p1"]);
  });

  it("keeps a pending row that was taken over by a posted transaction", async () => {
    const { store, run } = importWith([pendingRow()], [posted()]);
    const counts = await run();
    expect(counts).toMatchObject({ updated: 1, swept: 0 });
    expect(store.rows).toHaveLength(1);
  });

  it("sweeps a pre-existing pending twin of a completed row and an orphan", async () => {
    const { store, run } = importWith(
      [
        pendingRow({ id: "twin", date: "2024-03-10" }),
        pendingRow({ id: "orphan", date: "2024-02-01", description: "Cafe", chargedAmount: -9 }),
        pendingRow({ id: "posted", status: "completed", externalId: "ext-9", description: "Z" }),
      ],
      [posted()],
    );
    const counts = await run();
    expect(counts.swept).toBe(2);
    expect(store.rows.map((r) => r.id)).toEqual(["posted"]);
  });

  it("leaves a pending row older than the scrape window untouched", async () => {
    const { store, run } = importWith([pendingRow({ id: "old", date: "2023-12-31" })], []);
    const counts = await run();
    expect(counts.swept).toBe(0);
    expect(store.rows).toHaveLength(1);
  });

  it("leaves other accounts' pending rows and completed rows untouched", async () => {
    const { store, run } = importWith(
      [
        pendingRow({ id: "other-acct", bankAccountId: "acct-2", date: "2024-02-10" }),
        pendingRow({ id: "done", status: "completed", externalId: "x", date: "2024-02-10" }),
      ],
      [],
    );
    await run();
    expect(store.rows).toHaveLength(2);
  });

  it("sweeps nothing when the import throws midway", async () => {
    const store = createMemoryStore([pendingRow({ id: "gone", date: "2024-02-10" })]);
    store.insert = async () => {
      throw new Error("db down");
    };
    await expect(
      importAccountTransactions({
        transactions: [posted({ externalId: "new", description: "Cafe", chargedAmount: -9 })],
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
    const { store, run } = importWith([pendingRow({ date: "2024-02-10" })], [], null);
    const counts = await run();
    expect(counts.swept).toBe(0);
    expect(store.rows).toHaveLength(1);
  });

  it("is idempotent when the same scrape is imported twice", async () => {
    const txs = [posted(), stillPending({ description: "Cafe", chargedAmount: -9 })];
    const { store, run } = importWith([pendingRow()], txs);
    await run();
    const snapshot = JSON.stringify(store.rows);
    const second = await run();
    expect(second).toMatchObject({ inserted: 0, updated: 0, swept: 0 });
    expect(JSON.stringify(store.rows)).toBe(snapshot);
  });
});
