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
  readonly store: Pick<AppSettingsStore, "claimAppPassword">;
  readonly hash?: (password: string) => Promise<string>;
};

/**
 * The password step's write. Runs without a session, so it must be safe to
 * call by anyone who can reach the port: the store's claim is one conditional
 * statement, which makes a double submit, a second tab or a replay harmless by
 * construction (ADR-0014 §4).
 */
export async function establishInitialPassword(
  password: string,
  {
    hasEnvironmentOverride,
    store,
    hash = (p) => bcrypt.hash(p, BCRYPT_COST),
  }: EstablishPasswordDeps,
): Promise<PasswordClaimOutcome> {
  if (hasEnvironmentOverride) return "environment-override";
  const claimed = await store.claimAppPassword(await hash(password));
  return claimed ? "set" : "already-set";
}
