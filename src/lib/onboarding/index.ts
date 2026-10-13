/**
 * First-run onboarding (ADR-0014 §4–5): which wizard step to show, where
 * sign-in sends a fresh install, and the password step's conditional write.
 * `onboarding completion` (CONTEXT.md) is the sole first-run signal.
 */
export {
  SETUP_STEPS,
  SETUP_RESUME_COOKIE,
  parseSetupStep,
  stepAfter,
  stepBefore,
  type SetupStep,
} from "./steps";
export {
  resolveSetupView,
  resolveLoginView,
  loginDestination,
  type SetupState,
  type SetupRequest,
  type SetupView,
  type LoginView,
} from "./view";
export {
  establishInitialPassword,
  type PasswordClaimOutcome,
  type EstablishPasswordDeps,
} from "./password";
export { initialPasswordSchema, MIN_PASSWORD_LENGTH, type InitialPasswordInput } from "./schemas";
export { readSetupState, readLoginView, finishOnboarding, setInitialPassword } from "./db";
