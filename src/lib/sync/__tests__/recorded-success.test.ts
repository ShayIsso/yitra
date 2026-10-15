import { describe, it, expect } from "vitest";
import {
  startSyncRun,
  completeSyncRun,
  failSyncRun,
  getInstitutionsWithRecordedSuccess,
  isRecordedSuccess,
  type SyncRunRow,
  type SyncRunStore,
} from "../runs";

/** Answers the evidence read through the module's own predicate, as the Drizzle query mirrors it. */
function makeInMemoryStore(): SyncRunStore {
  const rows = new Map<string, SyncRunRow>();
  return {
    async insert(row) {
      rows.set(row.id, { ...row });
    },
    async update(id, patch) {
      const existing = rows.get(id);
      if (existing) rows.set(id, { ...existing, ...patch });
    },
    async getLastRunPerBank() {
      return [];
    },
    async getInstitutionsWithRecordedSuccess() {
      return [...new Set([...rows.values()].filter(isRecordedSuccess).map((row) => row.bank))];
    },
  };
}

describe("an institution's recorded successful sync", () => {
  it("is absent before any run", async () => {
    expect(await getInstitutionsWithRecordedSuccess(makeInMemoryStore())).toEqual([]);
  });

  it("is recorded once a run completes successfully", async () => {
    const store = makeInMemoryStore();
    const id = await startSyncRun(store, { bank: "isracard" });
    await completeSyncRun(store, id, { transactionsImported: 4 });

    expect(await getInstitutionsWithRecordedSuccess(store)).toEqual(["isracard"]);
  });

  it("is not recorded by a run still in flight, whose row starts out optimistically successful", async () => {
    const store = makeInMemoryStore();
    await startSyncRun(store, { bank: "isracard" });

    expect(await getInstitutionsWithRecordedSuccess(store)).toEqual([]);
  });

  it("is not recorded by a failed or OTP-skipped run", async () => {
    const store = makeInMemoryStore();
    const failed = await startSyncRun(store, { bank: "isracard" });
    await failSyncRun(store, failed, { status: "error", error: "GENERIC" });
    const skipped = await startSyncRun(store, { bank: "leumi" });
    await failSyncRun(store, skipped, { status: "otp_skipped" });

    expect(await getInstitutionsWithRecordedSuccess(store)).toEqual([]);
  });

  it("survives a later failure, since the evidence is any success ever recorded", async () => {
    const store = makeInMemoryStore();
    const first = await startSyncRun(store, { bank: "isracard" });
    await completeSyncRun(store, first, { transactionsImported: 4 });
    const second = await startSyncRun(store, { bank: "isracard" });
    await failSyncRun(store, second, { status: "error", error: "GENERIC" });

    expect(await getInstitutionsWithRecordedSuccess(store)).toEqual(["isracard"]);
  });
});
