import { z } from "zod";
import {
  credentialSchemaFor,
  enabledBankEntries,
  findBankEntry,
  type BankRegistryEntry,
  type CredentialSchemaOptions,
} from "@/lib/bank-registry";

const UNSUPPORTED_INSTITUTION = "מוסד לא נתמך";

const displayNameSchema = z.string().trim().min(1, "שם תצוגה חובה");
const credentialRowId = z.string().uuid("מזהה חשבון לא תקין");

/**
 * One variant per institution, discriminated on its literal id. Not on
 * `bankTypeSchema`: that is a `z.custom`, which Zod 4 cannot use as a
 * discriminant. The nested `credentials` object keeps a national-id field keyed
 * `id` from colliding with the row UUID.
 */
function institutionUnion<Id extends string, Shape extends z.ZodRawShape>(
  entries: readonly (BankRegistryEntry & { readonly id: Id })[],
  variantOf: (entry: BankRegistryEntry & { readonly id: Id }) => z.ZodObject<Shape>,
) {
  const variants = entries.map((entry) =>
    variantOf(entry).extend({ bankType: z.literal(entry.id) }),
  );
  type Variant = (typeof variants)[number];
  return z.discriminatedUnion("bankType", variants as unknown as [Variant, ...Variant[]], {
    error: (issue) => (issue.code === "invalid_union" ? UNSUPPORTED_INSTITUTION : undefined),
  });
}

/**
 * The credential boundary schemas for a set of institutions. Takes the entries
 * as a seam so an institution shaped like none of the registered ones can be
 * exercised without adding a fake entry to the production registry.
 *
 * - `add` — the add form and action: every field required.
 * - `edit` — the edit form only: a blank secret-kind field means "keep the
 *   stored value" (the client then sends no `credentials` at all). Derived from
 *   field kind, so no institution needs its own edit variant.
 * - `update` — the update action: `credentials` is absent (display-name change
 *   only) or a full replacement validated exactly as `add` validates it.
 */
export function credentialBoundarySchemas<Id extends string>(
  entries: readonly (BankRegistryEntry & { readonly id: Id })[],
) {
  const withCredentials = (options?: CredentialSchemaOptions) => (entry: BankRegistryEntry) =>
    z.object({ displayName: displayNameSchema, credentials: credentialSchemaFor(entry, options) });

  return {
    add: institutionUnion(entries, withCredentials()),
    edit: institutionUnion(entries, withCredentials({ allowBlankSecrets: true })),
    update: institutionUnion(entries, (entry) =>
      z.object({
        id: credentialRowId,
        displayName: displayNameSchema,
        credentials: credentialSchemaFor(entry).optional(),
      }),
    ),
  };
}

const registrySchemas = credentialBoundarySchemas(enabledBankEntries());

export const addCredentialSchema = registrySchemas.add;
export const editCredentialSchema = registrySchemas.edit;
export const updateCredentialSchema = registrySchemas.update;

export const credentialIdSchema = z.object({ id: credentialRowId });

/**
 * What the credentials module re-validates a write against: the institution
 * STORED on the row, never one a client submitted, so a forged payload that
 * lies about its institution cannot store another institution's field set.
 * A row whose institution is no longer registered accepts nothing.
 */
export function storedCredentialSchema(bankType: string): z.ZodType<Record<string, string>> {
  const entry = findBankEntry(bankType);
  return entry ? credentialSchemaFor(entry) : z.never({ error: UNSUPPORTED_INSTITUTION });
}
