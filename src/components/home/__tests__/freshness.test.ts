import { describe, it, expect } from "vitest";
import { homeFreshness, syncDayLabel, type FreshnessInput } from "@/components/home/freshness";

const NOW = Date.parse("2026-11-12T12:00:00Z");
const HOUR = 60 * 60 * 1000;

function input(over: Partial<FreshnessInput> = {}): FreshnessInput {
  return {
    runs: [
      { bank: "discount", status: "success" },
      { bank: "max", status: "success" },
    ],
    asOf: new Date(NOW - 3 * HOUR).toISOString(),
    stale: false,
    nowMs: NOW,
    live: { syncing: false, codeBank: null },
    ...over,
  };
}

describe("homeFreshness", () => {
  it("is quiet when the last sync is fresh", () => {
    expect(homeFreshness(input())).toEqual({ kind: "fresh", ageMs: 3 * HOUR });
  });

  it("is stale once the outlook says so", () => {
    const asOf = new Date(NOW - 50 * HOUR).toISOString();
    expect(homeFreshness(input({ asOf, stale: true }))).toEqual({
      kind: "stale",
      ageMs: 50 * HOUR,
    });
  });

  it("turns stale on the client clock once the page outlives the two days", () => {
    const asOf = new Date(NOW - 49 * HOUR).toISOString();
    expect(homeFreshness(input({ asOf, stale: false }))).toEqual({
      kind: "stale",
      ageMs: 49 * HOUR,
    });
  });

  it("keeps the server's stale verdict before the clock is read", () => {
    expect(homeFreshness(input({ stale: true, nowMs: null }))).toEqual({
      kind: "stale",
      ageMs: null,
    });
  });

  it("surfaces a failed bank over a stale sync", () => {
    const runs = [
      { bank: "discount", status: "success" as const },
      { bank: "max", status: "error" as const },
    ];
    expect(homeFreshness(input({ runs, stale: true }))).toEqual({
      kind: "failed",
      bank: "max",
    });
  });

  it("surfaces a missed code", () => {
    const runs = [{ bank: "max", status: "otp_skipped" as const }];
    expect(homeFreshness(input({ runs }))).toEqual({
      kind: "code-missed",
      bank: "max",
    });
  });

  it("reports a failure before a missed code", () => {
    const runs = [
      { bank: "discount", status: "otp_skipped" as const },
      { bank: "max", status: "error" as const },
    ];
    expect(homeFreshness(input({ runs })).kind).toBe("failed");
  });

  it("shows the live run while this tab syncs, over any earlier failure", () => {
    const runs = [{ bank: "max", status: "error" as const }];
    expect(homeFreshness(input({ runs, live: { syncing: true, codeBank: null } }))).toEqual({
      kind: "syncing",
    });
  });

  it("asks for the code the live run is waiting on", () => {
    expect(homeFreshness(input({ live: { syncing: true, codeBank: "discount" } }))).toEqual({
      kind: "code-needed",
      bank: "discount",
    });
  });

  it("has no age before the client has read its clock", () => {
    expect(homeFreshness(input({ nowMs: null }))).toEqual({
      kind: "fresh",
      ageMs: null,
    });
  });

  it("is unknown while there is no successful sync to measure", () => {
    expect(homeFreshness(input({ asOf: null }))).toEqual({ kind: "unknown" });
  });
});

describe("syncDayLabel", () => {
  // 12:00Z is 14:00 in Israel (UTC+2 in November).
  it("names today's sync by its Israel time", () => {
    expect(syncDayLabel("2026-11-12T06:05:00Z", NOW)).toBe("היום 08:05");
  });

  it("names yesterday's sync on the Israel calendar, even across UTC midnight", () => {
    expect(syncDayLabel("2026-11-11T23:30:00Z", NOW)).toBe("היום 01:30");
    expect(syncDayLabel("2026-11-11T08:00:00Z", NOW)).toBe("אתמול 10:00");
  });

  it("dates an older sync", () => {
    expect(syncDayLabel("2026-11-08T08:00:00Z", NOW)).toBe("8 בנובמבר");
  });
});
