"use server";

import { revalidatePath } from "next/cache";
import { formatZodError, formatZodFieldErrors, type FieldErrors } from "@/lib/api-utils";
import { requireSession } from "@/lib/auth";
import { addCredential, removeCredential } from "@/lib/credentials";
import { addCredentialSchema, credentialIdSchema } from "@/lib/credentials/schemas";

/*
 * The wizard's write path for its first institution. Settings' add action is
 * not imported here: it has no session check, and `/setup` is not behind the
 * middleware (the rule: `step-navigation.ts`), so this wraps the same schema
 * and the same credentials module behind `requireSession` instead.
 *
 * A store failure answers with a fixed message, never the error: a failed
 * insert's error carries its bound parameters (the encrypted blob, its IV and
 * tag, the display name), so nothing of it may reach the response.
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

  revalidateCredentialPages();
  return { added: true };
}

const INVALID_ID = "מזהה חשבון לא תקין";
const REMOVE_FAILED = "שגיאה בהסרת החשבון. נסו שוב.";

export type RemoveInstitutionResult = { readonly removed?: true; readonly error?: string };

/**
 * The wizard's way to fix a credential the first sync rejected: remove it and
 * add it again, since the step has no edit form. Same module call as Settings'
 * delete, so the database cascade is the same: the institution's bank accounts
 * and their transactions go with it.
 */
export async function removeInstitutionCredentialAction(
  input: unknown,
): Promise<RemoveInstitutionResult> {
  await requireSession("/setup");

  const parsed = credentialIdSchema.safeParse(input);
  if (!parsed.success) return { error: INVALID_ID };

  try {
    await removeCredential(parsed.data.id);
  } catch {
    return { error: REMOVE_FAILED };
  }

  revalidateCredentialPages();
  return { removed: true };
}

function revalidateCredentialPages() {
  revalidatePath("/settings");
  revalidatePath("/sync");
  revalidatePath("/");
  revalidatePath("/transactions");
}
