import { drizzleAppSettingsStore, type AppSettingsStore } from "@/lib/app-settings";
import { hasEnvironmentPasswordOverride, resolvePasswordSource } from "@/lib/auth";
import { establishInitialPassword, type PasswordClaimOutcome } from "./password";
import { resolveLoginView, type LoginView, type SetupState } from "./view";

export async function readSetupState(
  hasSession: boolean,
  store: Pick<AppSettingsStore, "read"> = drizzleAppSettingsStore,
): Promise<SetupState> {
  const settings = await store.read();
  return {
    completed: settings.onboardingCompletedAt !== null,
    passwordSource: resolvePasswordSource(
      hasEnvironmentPasswordOverride(),
      settings.hasAppPassword,
    ),
    hasSession,
  };
}

/**
 * An install on the environment override never needs the settings row to show
 * the sign-in form, so `/login` does not touch the database for it — existing
 * installs sign in exactly as before.
 */
export async function readLoginView(
  store: Pick<AppSettingsStore, "read"> = drizzleAppSettingsStore,
): Promise<LoginView> {
  if (hasEnvironmentPasswordOverride()) return { kind: "sign-in" };
  return resolveLoginView(await readSetupState(false, store));
}

export async function setInitialPassword(
  password: string,
  store: Pick<AppSettingsStore, "claimAppPassword"> = drizzleAppSettingsStore,
): Promise<PasswordClaimOutcome> {
  return establishInitialPassword(password, {
    hasEnvironmentOverride: hasEnvironmentPasswordOverride(),
    store,
  });
}

/** `false` when onboarding was already complete — the write is once-only (ADR-0014 §4). */
export async function finishOnboarding(
  store: Pick<AppSettingsStore, "completeOnboarding"> = drizzleAppSettingsStore,
): Promise<boolean> {
  return store.completeOnboarding(new Date());
}
