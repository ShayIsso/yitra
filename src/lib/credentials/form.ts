// Pure helpers behind the generic credential form. DB-free so the client
// component can import them; they decide everything from the entry's field list
// and each field's kind, never from the institution id.

import { isSecretFieldKind, type BankRegistryEntry } from "@/lib/bank-registry";

export type CredentialValues = Record<string, string>;

export function emptyCredentialValues(entry: BankRegistryEntry): CredentialValues {
  return Object.fromEntries(entry.credentialFields.map((field) => [field.key, ""]));
}

/**
 * Form state can still hold another institution's leftover keys; only the
 * selected institution's declared fields may leave the client.
 */
export function credentialValuesFor(
  entry: BankRegistryEntry,
  values: Readonly<CredentialValues>,
): CredentialValues {
  return Object.fromEntries(
    entry.credentialFields.map((field) => [field.key, values[field.key] ?? ""]),
  );
}

export type CredentialEditPlan =
  | { kind: "keep" }
  | { kind: "replace"; credentials: CredentialValues }
  | { kind: "needs-secret"; field: string };

/**
 * What an edit submission does with the stored credentials. Secrets are never
 * prefilled, so a blank secret means "keep the stored value" — and the stored
 * blob is encrypted as a whole, so changing any other login field without
 * re-entering the secret cannot be saved. That case is reported instead of
 * silently dropping the change.
 */
export function planCredentialEdit(
  entry: BankRegistryEntry,
  values: Readonly<CredentialValues>,
  prefill: Readonly<CredentialValues>,
): CredentialEditPlan {
  const credentials = credentialValuesFor(entry, values);
  const blankSecret = entry.credentialFields.find(
    (field) => isSecretFieldKind(field.kind) && credentials[field.key] === "",
  );
  if (!blankSecret) return { kind: "replace", credentials };

  const loginFieldChanged = entry.credentialFields.some(
    (field) =>
      !isSecretFieldKind(field.kind) && credentials[field.key] !== (prefill[field.key] ?? ""),
  );
  const secretTyped = entry.credentialFields.some(
    (field) => isSecretFieldKind(field.kind) && credentials[field.key] !== "",
  );
  if (loginFieldChanged || secretTyped) return { kind: "needs-secret", field: blankSecret.key };
  return { kind: "keep" };
}
