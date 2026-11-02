import { describe, it, expect } from "vitest";
import {
  awaitsCode,
  liveBankStatus,
  persistedBankStatus,
  syncStageProgress,
  type BankStatusView,
} from "@/components/bank-status-view";
import type { BankSyncState } from "@/components/sync-stream";
import type { SyncRunSummary } from "@/lib/sync/runs";

function live(status: BankSyncState["status"], extra: Partial<BankSyncState> = {}): BankSyncState {
  return { status, ...extra };
}

function persistedRun(overrides: Partial<SyncRunSummary> = {}): SyncRunSummary {
  return {
    id: "run-1",
    bank: "synthetic-bank",
    status: "success",
    transactionsImported: 12,
    startedAt: new Date("2026-07-24T10:00:00.000Z"),
    finishedAt: new Date("2026-07-24T10:01:00.000Z"),
    errorMessage: null,
    ...overrides,
  };
}

/** Every view states its outcome in words beside an icon — never by colour alone. */
function expectWordsAndIcon(view: BankStatusView) {
  expect(view.label.trim().length).toBeGreaterThan(0);
  expect(view.icon).toBeDefined();
}

describe("a bank's live status during a run", () => {
  it("is waiting its turn when the run has not reached it yet", () => {
    const view = liveBankStatus(undefined, { running: true });
    expect(view).toMatchObject({ tone: "waiting", icon: "clock", label: "ממתין לתורו" });
    expect(view.progress).toBeNull();
  });

  it("is plainly waiting before any run has started", () => {
    expect(liveBankStatus(undefined, { running: false })).toMatchObject({
      tone: "waiting",
      label: "ממתין",
    });
  });

  it.each([
    ["initializing", "מאתחל..."],
    ["logging_in", "מתחבר..."],
    ["login_success", "התחברות הצליחה"],
    ["scraping", "מוריד תנועות..."],
    ["importing", "מייבא לבסיס נתונים..."],
  ] as const)(
    "is running while %s, with its stage in words and a stage position",
    (status, label) => {
      const view = liveBankStatus(live(status), { running: true });
      expect(view).toMatchObject({ tone: "running", icon: "sync", label, alert: false });
      expect(view.progress).toBeGreaterThan(0);
      expect(view.progress).toBeLessThan(1);
    },
  );

  it("advances through the run's stages in the order the stream reports them", () => {
    const stages = [
      "initializing",
      "logging_in",
      "login_success",
      "scraping",
      "importing",
    ] as const;
    const progress = stages.map((status) => syncStageProgress(status));
    for (const value of progress) expect(value).toBeGreaterThan(0);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]!).toBeGreaterThan(progress[i - 1]!);
    }
    expect(progress.at(-1)!).toBeLessThan(1);
  });

  it("holds at the login stage while the run waits for an OTP", () => {
    expect(syncStageProgress("otp_required")).toBe(syncStageProgress("logging_in"));
  });

  it("shows no bar before the run reaches the institution, nor once its run has ended", () => {
    for (const status of [
      undefined,
      "idle",
      "complete",
      "error",
      "otp_timeout",
      "interrupted",
    ] as const) {
      expect(syncStageProgress(status)).toBeNull();
    }
  });

  it("says it succeeded and how many transactions it brought once complete", () => {
    const view = liveBankStatus(live("complete", { transactionCount: 42 }), { running: false });
    expect(view).toMatchObject({ tone: "done", icon: "check", progress: null });
    expect(view.label).toContain("הושלם");
    expect(view.label).toContain("42 תנועות");
  });

  it("says it succeeded before the transaction count arrives", () => {
    expect(liveBankStatus(live("complete"), { running: true }).label).toBe("הושלם");
  });

  it("asks for the one-time code as an announced attention state", () => {
    const view = liveBankStatus(live("otp_required"), {
      running: true,
      otp: { secondsLeft: 170, running: true },
    });
    expect(view).toMatchObject({
      tone: "attention",
      icon: "key",
      label: "נדרש קוד אימות",
      alert: true,
    });
  });

  it("waits on the bank, not on the owner, once the code has been sent", () => {
    const view = liveBankStatus(live("otp_required"), {
      running: true,
      otp: { secondsLeft: 120, running: false },
    });
    expect(view).toMatchObject({ tone: "running", icon: "sync", alert: false });
    expect(view.label).toContain("הקוד נשלח");
  });

  it("still asks for the code when the window ran out before the server says so", () => {
    const view = liveBankStatus(live("otp_required"), {
      running: true,
      otp: { secondsLeft: 0, running: false },
    });
    expect(view).toMatchObject({ tone: "attention", label: "נדרש קוד אימות" });
  });

  it("reports a missed code window as attention, in words", () => {
    const view = liveBankStatus(live("otp_timeout"), { running: false });
    expect(view).toMatchObject({ tone: "attention", icon: "warning", alert: true });
    expect(view.label).toBe("קוד האימות לא הוזן בזמן");
  });

  it("reports a failure calmly in words and keeps the sync's own message as the detail", () => {
    const view = liveBankStatus(live("error", { error: "synthetic failure text" }), {
      running: false,
    });
    expect(view).toMatchObject({
      tone: "attention",
      icon: "warning",
      label: "הסנכרון נכשל",
      detail: "synthetic failure text",
      alert: true,
      progress: null,
    });
  });

  it("has no detail for a failure that came without a message", () => {
    expect(liveBankStatus(live("error"), { running: false }).detail).toBeNull();
  });

  it("is stopped, not failed, when the stream broke off mid-run", () => {
    const view = liveBankStatus(live("interrupted"), { running: false });
    expect(view).toMatchObject({ tone: "quiet", icon: "pause", label: "הופסק", alert: false });
  });

  it.each([
    "idle",
    "initializing",
    "logging_in",
    "login_success",
    "scraping",
    "importing",
    "complete",
    "error",
    "otp_required",
    "otp_timeout",
    "interrupted",
  ] as const)("never tells %s by colour alone", (status) => {
    expectWordsAndIcon(liveBankStatus(live(status), { running: true }));
  });
});

describe("a bank's last recorded run, before this tab has heard from it", () => {
  it("says it has never synced when there is no recorded run", () => {
    expect(persistedBankStatus(undefined)).toMatchObject({
      tone: "quiet",
      icon: "dot",
      label: "עדיין לא סונכרן",
    });
  });

  it("states a success with its transaction count, the same before and after hydration", () => {
    const view = persistedBankStatus(persistedRun({ transactionsImported: 7 }));
    expect(view).toMatchObject({ tone: "done", icon: "check", alert: false });
    expect(view.label).toBe("סונכרן · 7 תנועות");
  });

  it("flags a missed code window as attention without announcing it", () => {
    const view = persistedBankStatus(persistedRun({ status: "otp_skipped" }));
    expect(view).toMatchObject({ tone: "attention", icon: "warning", alert: false });
    expect(view.label).toBe("קוד האימות לא הוזן בזמן");
  });

  it("flags a failed run as attention and carries its recorded message as the detail", () => {
    const view = persistedBankStatus(
      persistedRun({ status: "error", errorMessage: "synthetic recorded failure" }),
    );
    expect(view).toMatchObject({
      tone: "attention",
      icon: "warning",
      label: "הסנכרון האחרון נכשל",
      detail: "synthetic recorded failure",
    });
  });
});

describe("whether a bank is waiting on the owner for a one-time code", () => {
  it("is while the code is requested and the countdown runs", () => {
    expect(awaitsCode(live("otp_required"), { secondsLeft: 150, running: true })).toBe(true);
  });

  it("is not once a code was sent, which stops the countdown early", () => {
    expect(awaitsCode(live("otp_required"), { secondsLeft: 90, running: false })).toBe(false);
  });

  it("still is when the window ran out before the server reports it", () => {
    expect(awaitsCode(live("otp_required"), { secondsLeft: 0, running: false })).toBe(true);
  });

  it("is not in any other status", () => {
    expect(awaitsCode(live("scraping"), undefined)).toBe(false);
    expect(awaitsCode(undefined, undefined)).toBe(false);
  });
});
