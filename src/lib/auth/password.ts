import bcrypt from "bcrypt";
import { getEnv } from "@/lib/env";
import { drizzleAppSettingsStore, type AppSettingsStore } from "@/lib/app-settings";

export type PasswordHashReader = Pick<AppSettingsStore, "readAppPasswordHash">;

/**
 * Where the install's app password comes from. `environment` is the legacy
 * `APP_PASSWORD` override; `stored` is the hash the first-run wizard wrote;
 * `none` is a fresh install whose password step has not run yet.
 */
export type PasswordSource = "environment" | "stored" | "none";

/** ADR-0014 §2: the environment override wins whenever it is set. */
export function resolvePasswordSource(
  hasEnvironmentOverride: boolean,
  hasStoredPassword: boolean,
): PasswordSource {
  if (hasEnvironmentOverride) return "environment";
  return hasStoredPassword ? "stored" : "none";
}

export function hasEnvironmentPasswordOverride(): boolean {
  return getEnv().APP_PASSWORD !== undefined;
}

/**
 * Checks the override first and, only when it is unset, the stored hash — so
 * an install running on the override never touches `app_settings` to sign in,
 * and a stored hash left behind cannot be used while the override is set.
 * With neither configured, verification fails closed: never "any password
 * passes".
 */
export async function verifyPassword(
  input: string,
  store: PasswordHashReader = drizzleAppSettingsStore,
): Promise<boolean> {
  const hash = getEnv().APP_PASSWORD ?? (await store.readAppPasswordHash());
  if (!hash) return false;
  return bcrypt.compare(input, hash);
}
