import { describe, it, expect } from "vitest";
import { enabledBankTypes } from "@/lib/bank-registry";
import { classifySyncFreshness } from "@/components/dashboard/sync-freshness-pill";
import { getLastRunsForCurrentInstitutions, runsOfCurrentInstitutions } from "../current-runs";
import type { SyncRunStore, SyncRunSummary } from "../runs";

const NOW = new Date("2026-07-24T12:00:00.000Z").getTime();
const hoursAgo = (hours: number) => new Date(NOW - hours * 60 * 60 * 1000);

const [KEPT, DELETED] = enabledBankTypes();
const UNREGISTERED = "retired-institution";

function run(overrides: Partial<SyncRunSummary> & Pick<SyncRunSummary, "bank">): SyncRunSummary {
  return {
    id: `run-${overrides.bank}`,
    status: "success",
    transactionsImported: 0,
    startedAt: hoursAgo(1),
    finishedAt: hoursAgo(1),
    errorMessage: null,
    ...overrides,
  };
}

describe("runsOfCurrentInstitutions", () => {
  it("drops the runs of an institution whose credential no longer exists", () => {
    const runs = [run({ bank: KEPT }), run({ bank: DELETED })];

    expect(runsOfCurrentInstitutions(runs, [KEPT]).map((r) => r.bank)).toEqual([KEPT]);
  });

  it("drops a run whose institution is not registered even when a credential names it", () => {
    const runs = [run({ bank: KEPT }), run({ bank: UNREGISTERED })];

    expect(runsOfCurrentInstitutions(runs, [KEPT, UNREGISTERED]).map((r) => r.bank)).toEqual([
      KEPT,
    ]);
  });

  it("keeps the run once for an institution holding several credentials", () => {
    const runs = [run({ bank: KEPT })];

    expect(runsOfCurrentInstitutions(runs, [KEPT, KEPT])).toHaveLength(1);
  });

  it("returns nothing when there are no credentials", () => {
    expect(runsOfCurrentInstitutions([run({ bank: KEPT })], [])).toEqual([]);
  });
});

describe("freshness over current institutions", () => {
  it("ignores a deleted institution's failed run", () => {
    const runs = [
      run({ bank: KEPT, startedAt: hoursAgo(2) }),
      run({ bank: DELETED, status: "error" }),
    ];

    const verdict = classifySyncFreshness(runsOfCurrentInstitutions(runs, [KEPT]), NOW);

    expect(verdict.level).toBe("fresh");
  });

  it("ignores a deleted institution's stale run", () => {
    const runs = [
      run({ bank: KEPT, startedAt: hoursAgo(2) }),
      run({ bank: DELETED, startedAt: hoursAgo(24 * 30) }),
    ];

    const verdict = classifySyncFreshness(runsOfCurrentInstitutions(runs, [KEPT]), NOW);

    expect(verdict.level).toBe("fresh");
  });

  it("still lets a surviving institution's failed run decide the verdict", () => {
    const runs = [run({ bank: KEPT, status: "error" }), run({ bank: DELETED })];

    const verdict = classifySyncFreshness(runsOfCurrentInstitutions(runs, [KEPT, DELETED]), NOW);

    expect(verdict.level).toBe("error");
  });

  it("reports never when the only runs belong to deleted institutions", () => {
    const runs = [run({ bank: DELETED, status: "error" })];

    const verdict = classifySyncFreshness(runsOfCurrentInstitutions(runs, [KEPT]), NOW);

    expect(verdict).toEqual({ level: "never" });
  });
});

describe("getLastRunsForCurrentInstitutions", () => {
  it("reads the store's last run per bank and filters by the current credentials' institutions", async () => {
    const store = {
      getLastRunPerBank: async () => [run({ bank: KEPT }), run({ bank: DELETED })],
    } as unknown as SyncRunStore;

    const runs = await getLastRunsForCurrentInstitutions(store, async () => [KEPT]);

    expect(runs.map((r) => r.bank)).toEqual([KEPT]);
  });
});
