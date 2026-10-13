import { z } from "zod";
import type { BankRegistryEntry } from "./entries";
import { credentialFieldRule, isSecretFieldKind, type CredentialFieldDescriptor } from "./fields";

export interface CredentialSchemaOptions {
  /**
   * Let a secret-kind field be empty (it must still be present). This is the
   * edit form's "blank means keep the stored value" contract, derived from the
   * field kind rather than forked per institution; every non-secret field keeps
   * its full rule, so a prefilled value cannot be cleared.
   */
  readonly allowBlankSecrets?: boolean;
}

/**
 * The credential schema for one institution, replacing the per-institution Zod
 * declarations. Takes a resolved entry rather than an id on purpose: for an
 * unregistered id there are no fields, and a schema over no fields would accept
 * any credential payload instead of rejecting it.
 *
 * Undeclared keys are dropped from the parsed value (Zod's default object
 * behaviour), so callers must persist the parse result, never their input.
 */
export function credentialSchemaFor(
  entry: BankRegistryEntry,
  options: CredentialSchemaOptions = {},
): z.ZodObject<Record<string, z.ZodString>> {
  const shape: Record<string, z.ZodString> = {};
  for (const field of entry.credentialFields) {
    shape[field.key] = credentialFieldRule(field, {
      allowBlank: options.allowBlankSecrets === true && isSecretFieldKind(field.kind),
    });
  }
  return z.object(shape);
}

/**
 * The stored credential values that may leave the server: the declared fields
 * whose kind is not secret (ADR-0013 §2). An allowlist over the declared fields,
 * not a denylist over the stored keys, so a stored key no field declares — or
 * any field of an unregistered institution — is never exposed.
 */
export function nonSecretCredentialValues(
  fields: readonly CredentialFieldDescriptor[],
  stored: Readonly<Record<string, string>>,
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const field of fields) {
    const value = stored[field.key];
    if (!isSecretFieldKind(field.kind) && typeof value === "string") safe[field.key] = value;
  }
  return safe;
}
