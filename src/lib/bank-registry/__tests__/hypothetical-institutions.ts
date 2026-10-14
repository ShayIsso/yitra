import type { BankKind, BankType } from "../index";

/**
 * Institutions no registry entry carries, for consumer suites that pin "a newly
 * registered institution inherits the right semantics without touching this
 * module". Consumer rows are typed by the registered union, so the ids are
 * widened through `string`.
 *
 * Consumers stand them in by mocking the registry accessor at the module
 * boundary, never by mutating the frozen registry:
 *
 *   vi.mock("@/lib/bank-registry", async (importOriginal) => {
 *     const actual = await importOriginal<typeof import("@/lib/bank-registry")>();
 *     const { withHypotheticalInstitutions } = await import(
 *       "@/lib/bank-registry/__tests__/hypothetical-institutions"
 *     );
 *     return { ...actual, bankKindOf: withHypotheticalInstitutions(actual.bankKindOf) };
 *   });
 *
 * The real accessor is passed in rather than imported here: importing the
 * registry from inside that factory would resolve to the mock being built.
 */
export const HYPOTHETICAL_CARD = "hypothetical-card-issuer" as string as BankType;
export const HYPOTHETICAL_BANK = "hypothetical-account-bank" as string as BankType;
export const UNREGISTERED = "institution-with-no-entry" as string as BankType;

export function withHypotheticalInstitutions(
  realKindOf: (id: string) => BankKind | undefined,
): (id: string) => BankKind | undefined {
  return (id) => {
    if (id === HYPOTHETICAL_CARD) return "card";
    if (id === HYPOTHETICAL_BANK) return "bank";
    return realKindOf(id);
  };
}
