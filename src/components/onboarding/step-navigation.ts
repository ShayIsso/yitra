import { stepAfter, stepBefore, type SetupStep } from "@/lib/onboarding/steps";

/**
 * The contract between the wizard frame and a step body (#258's slot carving).
 * Each later step (#259–#262) owns exactly one file under `./steps/`, exporting
 * one component that takes `SetupStepProps` and one `StepMeta` with its copy;
 * the frame owns everything else — order, progress, and where these callbacks
 * lead. A slot changes only its own file; logic it shares with another step or
 * page moves into a module both import rather than being copied.
 *
 * Step bodies are client components. A step that needs to write must do it
 * through a Server Action whose first statement is
 * `await requireSession("/setup")` — never inside a `try`: `/setup` is exempt
 * from the auth gate, so nothing in its module graph is protected by the
 * middleware (`setup-action-guard.test.ts` enforces this). Without a session
 * the call redirects to sign-in and back, and nothing after it runs. Do not
 * import an existing Settings action into a step — wrap the library call in a
 * guarded setup-local action instead. Reads can use the existing `/api/*`
 * routes, which stay behind the gate; the visitor is signed in by then.
 */
export type StepNavigation = {
  /** Moves on to the next step; on the last step, completes onboarding and enters the app. */
  readonly advance: () => void;
  /** Same destination as `advance`, without the step's work. `null` where the step is mandatory. */
  readonly skip: (() => void) | null;
  /** `null` on the first step. */
  readonly back: (() => void) | null;
  readonly isLast: boolean;
  /** True while a navigation or the completion is in flight. */
  readonly pending: boolean;
};

export type StepNavigationHandlers = {
  readonly onNavigate: (step: SetupStep) => void;
  /** Completes onboarding; reached by advancing or skipping past the last step. */
  readonly onFinish: () => void;
  readonly pending: boolean;
};

/** Skipping the last step completes onboarding exactly as advancing it does (ADR-0014 §5). */
export function buildStepNavigation(
  step: SetupStep,
  { onNavigate, onFinish, pending }: StepNavigationHandlers,
): StepNavigation {
  const next = stepAfter(step);
  const previous = stepBefore(step);
  const forward = () => (next ? onNavigate(next) : onFinish());

  return {
    advance: forward,
    skip: step === "password" ? null : forward,
    back: previous ? () => onNavigate(previous) : null,
    isLast: next === null,
    pending,
  };
}

export type SetupStepProps = {
  readonly navigation: StepNavigation;
};

/** A step's copy, rendered by the frame around the step body. */
export type StepMeta = {
  /** Short label for the progress indicator. */
  readonly label: string;
  readonly title: string;
  readonly description: string;
};
