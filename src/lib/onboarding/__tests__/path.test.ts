import { describe, it, expect } from "vitest";
import { deriveOnboardingPath, hasPendingOnboardingStep } from "..";

const statuses = (hasCredential: boolean, hasSuccessfulSync: boolean, uncategorizedCount: number) =>
  deriveOnboardingPath({ hasCredential, hasSuccessfulSync, uncategorizedCount }).map(
    (s) => s.status,
  );

describe("deriveOnboardingPath", () => {
  it.each([
    [false, false, 5, ["pending", "pending", "pending"]],
    [false, false, 0, ["pending", "pending", "done"]],
    [false, true, 5, ["pending", "done", "pending"]],
    [false, true, 0, ["pending", "done", "done"]],
    [true, false, 5, ["done", "pending", "pending"]],
    [true, false, 0, ["done", "pending", "done"]],
    [true, true, 5, ["done", "done", "pending"]],
    [true, true, 0, ["done", "done", "done"]],
  ] as const)("credential=%s sync=%s uncategorized=%i", (cred, sync, count, expected) => {
    expect(statuses(cred, sync, count)).toEqual(expected);
  });

  it("returns the steps in path order", () => {
    const steps = deriveOnboardingPath({
      hasCredential: true,
      hasSuccessfulSync: true,
      uncategorizedCount: 0,
    });
    expect(steps.map((s) => s.id)).toEqual(["connect", "first-sync", "review"]);
  });

  it("un-ticks the first step when the only institution is deleted", () => {
    const before = deriveOnboardingPath({
      hasCredential: true,
      hasSuccessfulSync: true,
      uncategorizedCount: 0,
    });
    const after = deriveOnboardingPath({
      hasCredential: false,
      hasSuccessfulSync: true,
      uncategorizedCount: 0,
    });
    expect(before[0].status).toBe("done");
    expect(after[0].status).toBe("pending");
    expect(hasPendingOnboardingStep(before)).toBe(false);
    expect(hasPendingOnboardingStep(after)).toBe(true);
  });
});
