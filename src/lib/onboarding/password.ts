import bcrypt from "bcrypt";
import type { AppSettingsStore } from "@/lib/app-settings";

const BCRYPT_COST = 12;

/**
 * - `set`: this call stored the first password.
 * - `already-set`: a password was already stored, or onboarding is complete.
 * - `environment-override`: `APP_PASSWORD` is set, so a stored hash would be
 *   dead state — ignored while the override exists, and silently live the day
 *   it is removed. Nothing is written.
 */
export type PasswordClaimOutcome = "set" | "already-set" | "environment-override";

export type EstablishPasswordDeps = {
  readonly hasEnvironmentOverride: boolean;
  readonly store: Pick<AppSettingsStore, "read" | "claimAppPassword">;
  readonly hash?: (password: string) => Promise<string>;
};

/**
 * The password step's write. Runs without a session, so it must be safe to
 * call by anyone who can reach the port: the store's claim is one conditional
 * statement, which makes a double submit, a second tab or a replay harmless by
 * construction (ADR-0014 §4).
 *
 * The read before hashing is not that guard — it can be stale, and the write
 * re-checks. It exists so a refusal costs one read instead of a bcrypt hash:
 * after the window closes an anonymous POST would otherwise buy ~250 ms of CPU,
 * and an override install (no hash) would refuse measurably faster than a
 * stored one, leaking which it is. Both refusals now do the same single read.
 */
export async function establishInitialPassword(
  password: string,
  {
    hasEnvironmentOverride,
    store,
    hash = (p) => bcrypt.hash(p, BCRYPT_COST),
  }: EstablishPasswordDeps,
): Promise<PasswordClaimOutcome> {
  const current = await store.read();
  if (current.hasAppPassword || current.onboardingCompletedAt !== null) return "already-set";
  if (hasEnvironmentOverride) return "environment-override";

  const claimed = await store.claimAppPassword(await hash(password));
  return claimed ? "set" : "already-set";
}
