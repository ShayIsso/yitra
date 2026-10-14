// The library's `lib/definitions` module is imported directly rather than through
// the package root: the root barrel pulls in the scraper factory and puppeteer,
// which would make the bank registry unimportable from a client component and
// from the DB-free consumers below. `lib/definitions` has no dependencies of its own.
import { CompanyTypes } from "israeli-bank-scrapers-core/lib/definitions";
import type { CredentialFieldDescriptor } from "./fields";

/**
 * Whether an institution holds an account or issues a card. Code that needs
 * different behaviour for cards branches on this, never on an institution id
 * (ADR-0013 law 2) — an institution missing from a card-shaped set is invisible
 * to settlement reconciliation and to the next-debit estimate.
 */
export type BankKind = "bank" | "card";

/** Whether we have tested the institution ourselves. Presentational only, never a second code path. */
export type BankTier = "verified" | "experimental";

/**
 * Library companies that are deliberately neither verified nor experimental.
 * Declared rather than merely left out, so that excluding one is a reasoned,
 * reviewable fact and a library upgrade that adds a company fails the
 * completeness test until someone classifies it.
 */
export const excludedInstitutions = Object.freeze([
  {
    company: CompanyTypes.oneZero,
    reason:
      "Its login needs a long-term MFA token issued by a previous login, which ADR-0003 puts out of scope; listing it would promise what the scraper cannot deliver.",
  },
] as const);

type ExcludedCompany = (typeof excludedInstitutions)[number]["company"];

/** Typed so an entry naming an excluded company does not compile. */
export type SupportedCompany = Exclude<CompanyTypes, ExcludedCompany>;

export interface BankRegistryEntry {
  readonly id: string;
  readonly nameHe: string;
  readonly nameEn: string;
  readonly kind: BankKind;
  /**
   * Whether the library's scraper for this company consumes the OTP retriever.
   * Display only: the OTP flow is event-driven, so no code branches on it.
   */
  readonly issuesOtp: boolean;
  readonly company: SupportedCompany;
  /** Ordered as the credential form renders them. */
  readonly credentialFields: readonly CredentialFieldDescriptor[];
  readonly tier: BankTier;
}

/**
 * The single source of institution facts (ADR-0013). Adding an institution is an
 * entry here plus the scraper's company-mapping line — nothing else.
 *
 * Consumers read this through the accessors below, not by indexing it.
 *
 * The `as const` is load-bearing, not stylistic: without it `id` widens to
 * `string` and `BankType` silently stops constraining anything, while
 * `satisfies` keeps compiling. `__tests__/derived-union.test.ts` fails if it
 * is ever dropped.
 *
 * Every library company is either an entry here or in `excludedInstitutions`.
 * Experimental entries were hand-checked against the library source: their
 * field keys against its `loginFields` (pinned by the cross-check test) and
 * `issuesOtp` against whether its scraper calls the OTP retriever.
 */
export const bankRegistry = Object.freeze([
  {
    id: "discount",
    nameHe: "דיסקונט",
    nameEn: "Bank Discount",
    kind: "bank",
    issuesOtp: true,
    company: CompanyTypes.discount,
    credentialFields: [
      { key: "id", kind: "national-id", label: "תעודת זהות" },
      { key: "password", kind: "password", label: "סיסמה" },
      { key: "num", kind: "account-number", label: "מספר חשבון" },
    ],
    tier: "verified",
  },
  {
    id: "max",
    nameHe: "מקס",
    nameEn: "Max",
    kind: "card",
    issuesOtp: false,
    company: CompanyTypes.max,
    credentialFields: [
      { key: "username", kind: "text", label: "שם משתמש", hint: "שם משתמש לאינטרנט" },
      { key: "password", kind: "password", label: "סיסמה" },
    ],
    tier: "verified",
  },
  {
    id: "visaCal",
    nameHe: "ויזה כאל",
    nameEn: "Cal",
    kind: "card",
    issuesOtp: false,
    company: CompanyTypes.visaCal,
    credentialFields: [
      { key: "username", kind: "text", label: "שם משתמש", hint: "שם משתמש לאינטרנט" },
      { key: "password", kind: "password", label: "סיסמה" },
    ],
    tier: "verified",
  },
  {
    id: "hapoalim",
    nameHe: "הפועלים",
    nameEn: "Bank Hapoalim",
    kind: "bank",
    issuesOtp: false,
    company: CompanyTypes.hapoalim,
    credentialFields: [
      { key: "userCode", kind: "text", label: "קוד משתמש" },
      { key: "password", kind: "password", label: "סיסמה" },
    ],
    tier: "experimental",
  },
  {
    id: "leumi",
    nameHe: "לאומי",
    nameEn: "Bank Leumi",
    kind: "bank",
    issuesOtp: false,
    company: CompanyTypes.leumi,
    credentialFields: [
      { key: "username", kind: "text", label: "שם משתמש", hint: "שם משתמש לאינטרנט" },
      { key: "password", kind: "password", label: "סיסמה" },
    ],
    tier: "experimental",
  },
  {
    id: "mizrahi",
    nameHe: "מזרחי טפחות",
    nameEn: "Mizrahi Tefahot",
    kind: "bank",
    issuesOtp: false,
    company: CompanyTypes.mizrahi,
    credentialFields: [
      { key: "username", kind: "text", label: "שם משתמש", hint: "שם משתמש לאינטרנט" },
      { key: "password", kind: "password", label: "סיסמה" },
    ],
    tier: "experimental",
  },
  {
    id: "mercantile",
    nameHe: "מרכנתיל",
    nameEn: "Mercantile",
    kind: "bank",
    issuesOtp: false,
    company: CompanyTypes.mercantile,
    credentialFields: [
      { key: "id", kind: "national-id", label: "תעודת זהות" },
      { key: "password", kind: "password", label: "סיסמה" },
      { key: "num", kind: "account-number", label: "מספר חשבון" },
    ],
    tier: "experimental",
  },
  {
    id: "beinleumi",
    nameHe: "הבינלאומי",
    nameEn: "Beinleumi",
    kind: "bank",
    issuesOtp: false,
    company: CompanyTypes.beinleumi,
    credentialFields: [
      { key: "username", kind: "text", label: "שם משתמש", hint: "שם משתמש לאינטרנט" },
      { key: "password", kind: "password", label: "סיסמה" },
    ],
    tier: "experimental",
  },
  {
    id: "otsarHahayal",
    nameHe: "אוצר החייל",
    nameEn: "Otsar Hahayal",
    kind: "bank",
    issuesOtp: false,
    company: CompanyTypes.otsarHahayal,
    credentialFields: [
      { key: "username", kind: "text", label: "שם משתמש", hint: "שם משתמש לאינטרנט" },
      { key: "password", kind: "password", label: "סיסמה" },
    ],
    tier: "experimental",
  },
  {
    id: "massad",
    nameHe: "מסד",
    nameEn: "Bank Massad",
    kind: "bank",
    issuesOtp: false,
    company: CompanyTypes.massad,
    credentialFields: [
      { key: "username", kind: "text", label: "שם משתמש", hint: "שם משתמש לאינטרנט" },
      { key: "password", kind: "password", label: "סיסמה" },
    ],
    tier: "experimental",
  },
  {
    id: "pagi",
    nameHe: "פאג״י",
    nameEn: "Pagi",
    kind: "bank",
    issuesOtp: false,
    company: CompanyTypes.pagi,
    credentialFields: [
      { key: "username", kind: "text", label: "שם משתמש", hint: "שם משתמש לאינטרנט" },
      { key: "password", kind: "password", label: "סיסמה" },
    ],
    tier: "experimental",
  },
  {
    id: "yahav",
    nameHe: "יהב",
    nameEn: "Bank Yahav",
    kind: "bank",
    issuesOtp: false,
    company: CompanyTypes.yahav,
    credentialFields: [
      { key: "username", kind: "text", label: "שם משתמש", hint: "שם משתמש לאינטרנט" },
      { key: "nationalID", kind: "national-id", label: "תעודת זהות" },
      { key: "password", kind: "password", label: "סיסמה" },
    ],
    tier: "experimental",
  },
  {
    id: "union",
    nameHe: "איגוד",
    nameEn: "Union Bank",
    kind: "bank",
    issuesOtp: false,
    company: CompanyTypes.union,
    credentialFields: [
      { key: "username", kind: "text", label: "שם משתמש", hint: "שם משתמש לאינטרנט" },
      { key: "password", kind: "password", label: "סיסמה" },
    ],
    tier: "experimental",
  },
  {
    id: "isracard",
    nameHe: "ישראכרט",
    nameEn: "Isracard",
    kind: "card",
    issuesOtp: false,
    company: CompanyTypes.isracard,
    credentialFields: [
      { key: "id", kind: "national-id", label: "תעודת זהות" },
      { key: "card6Digits", kind: "card-6-digits", label: "מספר כרטיס", hint: "6 הספרות האחרונות" },
      { key: "password", kind: "password", label: "סיסמה" },
    ],
    tier: "experimental",
  },
  {
    id: "amex",
    nameHe: "אמריקן אקספרס",
    nameEn: "American Express",
    kind: "card",
    issuesOtp: false,
    company: CompanyTypes.amex,
    credentialFields: [
      { key: "id", kind: "national-id", label: "תעודת זהות" },
      { key: "card6Digits", kind: "card-6-digits", label: "מספר כרטיס", hint: "6 הספרות האחרונות" },
      { key: "password", kind: "password", label: "סיסמה" },
    ],
    tier: "experimental",
  },
  {
    id: "beyahadBishvilha",
    nameHe: "ביחד בשבילך",
    nameEn: "Beyahad Bishvilha",
    kind: "card",
    issuesOtp: false,
    company: CompanyTypes.beyahadBishvilha,
    credentialFields: [
      { key: "id", kind: "national-id", label: "תעודת זהות" },
      { key: "password", kind: "password", label: "סיסמה" },
    ],
    tier: "experimental",
  },
  {
    id: "behatsdaa",
    nameHe: "בהצדעה",
    nameEn: "Behatsdaa",
    kind: "card",
    issuesOtp: false,
    company: CompanyTypes.behatsdaa,
    credentialFields: [
      { key: "id", kind: "national-id", label: "תעודת זהות" },
      { key: "password", kind: "password", label: "סיסמה" },
    ],
    tier: "experimental",
  },
] as const satisfies readonly BankRegistryEntry[]);

/** Never replace this with a hand-written union: such copies are what ADR-0013 exists to retire. */
export type BankType = (typeof bankRegistry)[number]["id"];

const byId: ReadonlyMap<string, BankRegistryEntry> = new Map(
  bankRegistry.map((entry) => [entry.id, entry]),
);

/**
 * The only entry lookup, and it takes `string` rather than `BankType` on purpose.
 * Institution ids arrive as database text with no CHECK constraint behind them
 * (ADR-0013 §4), so a row naming a de-registered institution must stay readable
 * and render as unknown. A lookup typed `(id: BankType) => BankRegistryEntry`
 * would let a caller cast such text and then read a property off `undefined`,
 * turning the very case §4 accepts into a crash — so the optional return is what
 * forces every consumer to handle it at compile time.
 */
export function findBankEntry(id: string): BankRegistryEntry | undefined {
  return byId.get(id);
}

export function isBankType(id: string): id is BankType {
  return byId.has(id);
}

/**
 * Every institution a user may select. Every registered institution is selectable:
 * the tier is presentational, never a gate, so this must not filter by tier.
 */
export function enabledBankEntries(): readonly (BankRegistryEntry & { readonly id: BankType })[] {
  return bankRegistry;
}

export function enabledBankTypes(): readonly BankType[] {
  return bankRegistry.map((entry) => entry.id);
}

/**
 * The property to branch on instead of an institution id (ADR-0013 law 2).
 * Undefined for an unregistered id, so `bankKindOf(x) === "card"` excludes it —
 * matching how the sets this replaces treated an unknown id.
 */
export function bankKindOf(id: string): BankKind | undefined {
  return byId.get(id)?.kind;
}

export function bankIssuesOtp(id: string): boolean {
  return byId.get(id)?.issuesOtp ?? false;
}

/**
 * Empty for an unregistered id: a caller stripping a stored credential row by
 * field kind then exposes nothing, which is the safe direction to fail.
 */
export function credentialFieldsFor(id: string): readonly CredentialFieldDescriptor[] {
  return byId.get(id)?.credentialFields ?? [];
}
