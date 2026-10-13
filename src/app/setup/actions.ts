"use server";

import { redirect } from "next/navigation";
import { formatZodError, formatZodFieldErrors, type FieldErrors } from "@/lib/api-utils";
import { establishSession, requireSession } from "@/lib/auth";
import {
  ensureDefaultCategories,
  finishOnboarding,
  initialPasswordSchema,
  readSetupState,
  setInitialPassword,
} from "@/lib/onboarding";

/*
 * Nothing here is behind the middleware: every action must begin with
 * `await requireSession("/setup")` (the rule and why: `step-navigation.ts`).
 * The password claim alone runs before any session can exist and is guarded
 * by its conditional write instead (ADR-0014 §4).
 *
 * Both refusals read the same, so an anonymous caller cannot learn whether the
 * install runs on the APP_PASSWORD override. The page never offers the form
 * once a password exists, so only a replayed or crafted request sees this.
 */
const REFUSED = "כבר הוגדרה סיסמה. היכנסו עם הסיסמה הקיימת.";

export async function setInitialPasswordAction(
  input: unknown,
): Promise<{ error?: string; fieldErrors?: FieldErrors }> {
  const parsed = initialPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  const outcome = await setInitialPassword(parsed.data.password);
  if (outcome !== "set") return { error: REFUSED };

  await establishSession();
  return {};
}

export async function completeOnboardingAction(): Promise<void> {
  await requireSession("/setup");
  if (!(await readSetupState(true)).completed) await ensureDefaultCategories();
  await finishOnboarding();
  redirect("/");
}
