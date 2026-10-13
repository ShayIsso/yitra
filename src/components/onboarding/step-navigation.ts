/**
 * The contract between the wizard frame and a step body (#258's slot carving).
 * Each later step (#259–#262) owns exactly one file under `./steps/`, exporting
 * one component that takes `SetupStepProps`; the frame owns everything else —
 * order, progress, titles, and where these callbacks lead.
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

export type SetupStepProps = {
  readonly navigation: StepNavigation;
};
