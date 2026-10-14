"use server";

import { formatZodError, formatZodFieldErrors, type FieldErrors } from "@/lib/api-utils";
import { requireSession } from "@/lib/auth";
import { addCredential } from "@/lib/credentials";
import { addCredentialSchema } from "@/lib/credentials/schemas";

/*
 * The wizard's write path for its first institution. Settings' add action is
 * not imported here: it has no session check, and `/setup` is not behind the
 * middleware (the rule: `step-navigation.ts`), so this wraps the same schema
 * and the same credentials module behind `requireSession` instead.
 *
 * A store failure answers with a fixed message, never the error: a failed
 * insert's error carries its bound parameters, i.e. the encrypted blob and
 * the submitted values, so nothing of it may reach the response.
 */
const SAVE_FAILED = "שגיאה בשמירת פרטי החשבון. נסו שוב.";

export type InstitutionActionResult = {
  readonly added?: true;
  readonly error?: string;
  readonly fieldErrors?: FieldErrors;
};

export async function addInstitutionCredentialAction(
  input: unknown,
): Promise<InstitutionActionResult> {
  await requireSession("/setup");

  const parsed = addCredentialSchema.safeParse(input);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  const { bankType, displayName, credentials } = parsed.data;
  try {
    await addCredential(bankType, displayName, credentials);
  } catch {
    return { error: SAVE_FAILED };
  }
  return { added: true };
}
