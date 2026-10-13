/**
 * The first-run wizard's steps, in order (epic #248 §10). Only `password` is
 * mandatory; every later step is skippable.
 */
export const SETUP_STEPS = [
  "password",
  "categories",
  "institution",
  "provider",
  "first-sync",
] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

/**
 * The last step this browser reached, so a bare `/setup` resumes there. A UI
 * convenience, not state: it is validated like the `?step=` parameter, and the
 * page decides what is actually reachable.
 */
export const SETUP_RESUME_COOKIE = "yitra-setup-step";

export function parseSetupStep(raw: unknown): SetupStep | null {
  return typeof raw === "string" && (SETUP_STEPS as readonly string[]).includes(raw)
    ? (raw as SetupStep)
    : null;
}

export function stepAfter(step: SetupStep): SetupStep | null {
  return SETUP_STEPS[SETUP_STEPS.indexOf(step) + 1] ?? null;
}

export function stepBefore(step: SetupStep): SetupStep | null {
  return SETUP_STEPS[SETUP_STEPS.indexOf(step) - 1] ?? null;
}
