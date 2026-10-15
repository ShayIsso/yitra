import { describe, it, expect } from "vitest";
import { deriveOnboardingPath, shouldShowOnboardingPath } from "..";

const derive = (hasCredential: boolean, hasSuccessfulSync: boolean, uncategorizedCount: number) =>
  deriveOnboardingPath({ hasCredential, hasSuccessfulSync, uncategorizedCount });

describe("deriveOnboardingPath", () => {
  it.each([
    [false, false, 5, ["pending", "pending", "pending"]],
    [false, false, 0, ["pending", "pending", "pending"]],
    [false, true, 5, ["pending", "done", "pending"]],
    [false, true, 0, ["pending", "done", "done"]],
    [true, false, 5, ["done", "pending", "pending"]],
    [true, false, 0, ["done", "pending", "pending"]],
    [true, true, 5, ["done", "done", "pending"]],
    [true, true, 0, ["done", "done", "done"]],
  ] as const)("credential=%s sync=%s uncategorized=%i", (cred, sync, count, expected) => {
    expect(derive(cred, sync, count).map((s) => s.status)).toEqual(expected);
  });

  it("returns the steps in path order", () => {
    expect(derive(true, true, 0).map((s) => s.id)).toEqual(["connect", "first-sync", "review"]);
  });

  it("un-ticks the first step when the only institution is deleted", () => {
    expect(derive(true, true, 0)[0].status).toBe("done");
    expect(derive(false, true, 0)[0].status).toBe("pending");
  });
});

describe("shouldShowOnboardingPath", () => {
  it("shows on a fresh install", () => {
    expect(shouldShowOnboardingPath(derive(false, false, 0))).toBe(true);
  });

  it("shows while connected but not yet synced", () => {
    expect(shouldShowOnboardingPath(derive(true, false, 0))).toBe(true);
  });

  it("hides once connected and synced, even with an uncategorized backlog", () => {
    expect(shouldShowOnboardingPath(derive(true, true, 12))).toBe(false);
  });

  it("hides when every step is done", () => {
    expect(shouldShowOnboardingPath(derive(true, true, 0))).toBe(false);
  });

  it("reappears when the only institution is deleted after a sync", () => {
    expect(shouldShowOnboardingPath(derive(true, true, 0))).toBe(false);
    expect(shouldShowOnboardingPath(derive(false, true, 0))).toBe(true);
  });
});
