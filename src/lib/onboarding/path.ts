export const ONBOARDING_PATH_STEPS = ["connect", "first-sync", "review"] as const;

export type OnboardingPathStepId = (typeof ONBOARDING_PATH_STEPS)[number];

export type OnboardingPathStep = {
  id: OnboardingPathStepId;
  status: "done" | "pending";
};

/** The three live facts the path is derived from — nothing about it is stored. */
export type OnboardingPathFacts = {
  hasCredential: boolean;
  hasSuccessfulSync: boolean;
  uncategorizedCount: number;
};

/**
 * Pure derivation (epic #248 §12): each step is re-read from live state, so
 * one that stops being true — the only institution deleted — un-ticks itself.
 * No latch: that would need storage, and a stored "done" can't un-tick.
 */
export function deriveOnboardingPath(facts: OnboardingPathFacts): OnboardingPathStep[] {
  const done: Record<OnboardingPathStepId, boolean> = {
    connect: facts.hasCredential,
    "first-sync": facts.hasSuccessfulSync,
    review: facts.uncategorizedCount === 0,
  };
  return ONBOARDING_PATH_STEPS.map((id) => ({ id, status: done[id] ? "done" : "pending" }));
}

export function hasPendingOnboardingStep(steps: OnboardingPathStep[]): boolean {
  return steps.some((step) => step.status === "pending");
}
