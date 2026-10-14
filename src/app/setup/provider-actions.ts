"use server";

import { revalidatePath } from "next/cache";
import { formatZodError, formatZodFieldErrors, type FieldErrors } from "@/lib/api-utils";
import { requireSession } from "@/lib/auth";
import {
  clearStoredProviderKey,
  providerSelectionSchema,
  readProviderSettings,
  saveProviderSelection,
  type ProviderSettingsView,
} from "@/lib/ai-categorization";

/*
 * Setup-local actions (the step contract in `step-navigation.ts`) that the
 * Settings section also mounts, so the provider has one form and one write
 * path (#261). They sit in `/setup`'s module graph, which the middleware does
 * not gate, so each begins with `requireSession` (`setup-action-guard.test.ts`).
 * The `/setup` return target suits both callers: a completed install is sent
 * on from there to the dashboard.
 *
 * No response carries a key — only `ProviderSettingsView`'s presence flags —
 * and a failed write surfaces as a fixed message, never the error itself.
 */

export type ProviderActionResult = {
  readonly settings?: ProviderSettingsView;
  readonly error?: string;
  readonly fieldErrors?: FieldErrors;
};

const SAVE_FAILED = "שגיאה בשמירת ההגדרה. נסו שוב.";
const ENVIRONMENT_PINNED = "הספק נקבע במשתנה הסביבה AI_PROVIDER, ולכן לא ניתן לשנות אותו כאן.";
const KEY_REQUIRED = "כדי להשתמש בספק החיצוני יש להדביק מפתח API.";

export async function getProviderSettingsAction(): Promise<ProviderSettingsView> {
  await requireSession("/setup");
  return readProviderSettings();
}

export async function saveProviderSettingsAction(input: unknown): Promise<ProviderActionResult> {
  await requireSession("/setup");

  const parsed = providerSelectionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  let outcome;
  try {
    outcome = await saveProviderSelection(parsed.data);
  } catch {
    return { error: SAVE_FAILED };
  }

  if (outcome === "environment_pinned") return { error: ENVIRONMENT_PINNED };
  if (outcome === "key_required") return { fieldErrors: { apiKey: KEY_REQUIRED } };

  revalidatePath("/settings");
  return { settings: await readProviderSettings() };
}

export async function clearProviderKeyAction(): Promise<ProviderActionResult> {
  await requireSession("/setup");

  try {
    await clearStoredProviderKey();
  } catch {
    return { error: SAVE_FAILED };
  }

  revalidatePath("/settings");
  return { settings: await readProviderSettings() };
}
