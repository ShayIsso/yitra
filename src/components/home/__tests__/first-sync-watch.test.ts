import { describe, it, expect } from "vitest";
import { firstSyncRunEnded, runsSignature } from "@/components/home/first-sync-watch";
import type { OutlookResponse } from "@/components/home/outlook-view";

const running: OutlookResponse = {
  state: "first-sync",
  progress: { running: true, banksDone: 1, banksTotal: 2 },
};
const idle: OutlookResponse = {
  state: "first-sync",
  progress: { running: false, banksDone: 0, banksTotal: 2 },
};
const thin: OutlookResponse = {
  state: "thin-history",
  spent: 1200,
  asOf: "2026-11-12T08:00:00.000Z",
  stale: false,
};

describe("firstSyncRunEnded", () => {
  it("is true when the outlook leaves first-sync after a running first sync", () => {
    expect(firstSyncRunEnded(running, thin)).toBe(true);
  });

  it("is true when the first sync stops running without a success", () => {
    expect(firstSyncRunEnded(running, idle)).toBe(true);
  });

  it("is false while the first sync keeps running", () => {
    expect(
      firstSyncRunEnded(running, { ...running, progress: { ...running.progress, banksDone: 2 } }),
    ).toBe(false);
  });

  it("is false when no first sync was running before", () => {
    expect(firstSyncRunEnded(idle, thin)).toBe(false);
    expect(firstSyncRunEnded(null, thin)).toBe(false);
  });
});

const run = (bank: string, status: "success" | "error", finishedAt: string | null) => ({
  id: `run-${bank}`,
  bank,
  status,
  transactionsImported: 0,
  startedAt: "2026-11-12T08:00:00.000Z",
  finishedAt,
  errorMessage: null,
});

describe("runsSignature", () => {
  it("is the same for the same runs in any order", () => {
    const a = [run("discount", "success", null), run("max", "success", null)];
    expect(runsSignature(a)).toBe(runsSignature([...a].reverse()));
  });

  it("changes when a bank's run finishes", () => {
    expect(runsSignature([run("discount", "success", null)])).not.toBe(
      runsSignature([run("discount", "success", "2026-11-12T08:03:00.000Z")]),
    );
  });

  it("changes when a run fails", () => {
    expect(runsSignature([run("max", "success", "2026-11-12T08:03:00.000Z")])).not.toBe(
      runsSignature([run("max", "error", "2026-11-12T08:03:00.000Z")]),
    );
  });
});
