"use server";

import { redirect } from "next/navigation";
import { formatZodError, formatZodFieldErrors, type FieldErrors } from "@/lib/api-utils";
import { establishSession, requireSession } from "@/lib/auth";
import {
  finishOnboarding,
  initialPasswordSchema,
  setInitialPassword,
  type PasswordClaimOutcome,
} from "@/lib/onboarding";

/*
 * `/setup` is exempt from the auth gate, and a Server Action is POSTed to the
 * page that rendered it — so nothing here is behind the middleware. Every
 * action in this file, and in any file `/setup` imports, must call
 * `requireSession()` first. The single exception is the password step, which
 * runs before any session can exist and is guarded instead by its conditional
 * write (ADR-0014 §4). `setup-action-guard.test.ts` enforces this.
 */

const REFUSED: Record<Exclude<PasswordClaimOutcome, "set">, string> = {
  "already-set": "כבר הוגדרה סיסמה. היכנסו עם הסיסמה הקיימת.",
  "environment-override": "הסיסמה מוגדרת במשתנה הסביבה APP_PASSWORD, ולכן לא ניתן להגדיר אותה כאן.",
};

export async function setInitialPasswordAction(
  input: unknown,
): Promise<{ error?: string; fieldErrors?: FieldErrors }> {
  const parsed = initialPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  const outcome = await setInitialPassword(parsed.data.password);
  if (outcome !== "set") return { error: REFUSED[outcome] };

  await establishSession();
  return {};
}

export async function completeOnboardingAction(): Promise<void> {
  await requireSession();
  await finishOnboarding();
  redirect("/");
}
