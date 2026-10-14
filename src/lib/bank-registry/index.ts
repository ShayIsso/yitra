/**
 * bank-registry — the single source of institution facts (ADR-0013).
 *
 * Pure and DB-free by design, and with no runtime dependency beyond `zod`, so
 * `analytics`, `reconciliation` and client components can all import it. A
 * refactor that adds a DB-barrel or scraper-barrel import here breaks those
 * consumers silently; `__tests__/purity.test.ts` guards it.
 *
 * Two laws bind consumers: a bank literal outside this module is a bug, and code
 * branches on a registry property (`kind`, `issuesOtp`, a field's `kind`) rather
 * than on an institution id.
 */
export type { BankKind, BankTier, BankRegistryEntry, BankType, SupportedCompany } from "./entries";
export {
  bankRegistry,
  excludedInstitutions,
  findBankEntry,
  isBankType,
  enabledBankEntries,
  enabledBankTypes,
  bankKindOf,
  bankIssuesOtp,
  credentialFieldsFor,
} from "./entries";

export type { BankLocale } from "./labels";
export { bankLabel } from "./labels";

export type {
  CredentialFieldKind,
  CredentialFieldDescriptor,
  CredentialFieldRendering,
} from "./fields";
export { credentialFieldKinds, isSecretFieldKind, credentialFieldRendering } from "./fields";

export type { CredentialSchemaOptions } from "./credential-schema";
export { credentialSchemaFor, nonSecretCredentialValues } from "./credential-schema";
export { bankTypeSchema } from "./bank-type-schema";

export type { BankTrust, BankTrustInput } from "./trust";
export { resolveBankTrust, bankTrustOf } from "./trust";
