import { findBankEntry, type BankRegistryEntry } from "./entries";

/**
 * The trust to display. `verified` is our claim, `observed` is this install's own
 * evidence, `experimental` is the caveated state — the distinction being that the
 * registry states what we have verified and the instance states what it has
 * observed. All three take the identical code path: same scraper invocation, same
 * import, only the label differs (ADR-0013 §3).
 */
export type BankTrust = "verified" | "observed" | "experimental";

export interface BankTrustInput {
  readonly entry: BankRegistryEntry;
  readonly hasRecordedSuccessfulSync: boolean;
}

/**
 * Pure: a recorded success retires the experimental caveat by being read, never by
 * being written back to the entry or to a user-editable flag.
 */
export function resolveBankTrust({ entry, hasRecordedSuccessfulSync }: BankTrustInput): BankTrust {
  if (entry.tier === "verified") return "verified";
  return hasRecordedSuccessfulSync ? "observed" : "experimental";
}

/**
 * The trust to display for a stored institution id, given the ids this install
 * has recorded a successful sync for. The evidence is supplied by the caller
 * because the registry is DB-free; an empty set is the safe default, since it
 * can only show a caveat, never hide one. Undefined for an id that is not
 * registered — including an excluded one, whatever the evidence says.
 */
export function bankTrustOf(id: string, observed: ReadonlySet<string>): BankTrust | undefined {
  const entry = findBankEntry(id);
  if (!entry) return undefined;
  return resolveBankTrust({ entry, hasRecordedSuccessfulSync: observed.has(id) });
}
