import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SyncPanel, observedWithLiveRun } from "@/components/sync-panel";
import { unverifiedFailureNote } from "@/components/institution-trust";
import type { SyncRunSummary } from "@/lib/sync/runs";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const UNVERIFIED = "עדיין לא נבדק על ידינו";

describe("unverifiedFailureNote", () => {
  it("names an experimental institution as unverified", () => {
    const note = unverifiedFailureNote("isracard", "experimental");
    expect(note).toContain("ישראכרט");
    expect(note).toContain(UNVERIFIED);
  });

  it("adds nothing to a verified, observed or unregistered institution's failure", () => {
    expect(unverifiedFailureNote("discount", "verified")).toBeNull();
    expect(unverifiedFailureNote("isracard", "observed")).toBeNull();
    expect(unverifiedFailureNote("retiredInstitution", undefined)).toBeNull();
  });
});

describe("a failed run on the sync page", () => {
  const ERROR_TEXT = "GENERIC";

  function failedRun(bank: string): SyncRunSummary {
    return {
      id: "run-1",
      bank,
      status: "error",
      transactionsImported: 0,
      startedAt: new Date("2026-01-15T08:00:00Z"),
      finishedAt: new Date("2026-01-15T08:05:00Z"),
      errorMessage: ERROR_TEXT,
    };
  }

  function renderFailure(bankType: string, observedInstitutions?: string[]) {
    return renderToStaticMarkup(
      createElement(SyncPanel, {
        banks: [{ id: "cred-1", bankType, displayName: "Synthetic account" }],
        lastRuns: [failedRun(bankType)],
        observedInstitutions,
      }),
    );
  }

  it("names an experimental institution as unverified beside the error", () => {
    const html = renderFailure("isracard");
    expect(html).toContain(ERROR_TEXT);
    expect(html).toContain(UNVERIFIED);
  });

  it("keeps the caveat when no evidence was supplied at all", () => {
    expect(renderFailure("amex", undefined)).toContain(UNVERIFIED);
  });

  it("drops the caveat once this install has synced the institution", () => {
    expect(renderFailure("isracard", ["isracard"])).not.toContain(UNVERIFIED);
  });

  it("leaves a verified institution's failure exactly as reported", () => {
    const html = renderFailure("discount");
    expect(html).toContain(ERROR_TEXT);
    expect(html).not.toContain(UNVERIFIED);
    expect(html).not.toContain("ניסיוני");
  });
});

describe("observedWithLiveRun", () => {
  it("counts an institution that completed in the run on screen", () => {
    expect(
      observedWithLiveRun(["leumi"], {
        isracard: { status: "complete" },
        amex: { status: "error" },
      }),
    ).toEqual(new Set(["leumi", "isracard"]));
  });

  it("does not count one still in progress", () => {
    expect(observedWithLiveRun([], { isracard: { status: "scraping" } })).toEqual(new Set());
  });
});
