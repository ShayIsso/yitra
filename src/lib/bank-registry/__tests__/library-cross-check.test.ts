import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { CompanyTypes, SCRAPERS, PASSWORD_FIELD } from "israeli-bank-scrapers-core/lib/definitions";
import { enabledBankEntries } from "../index";

/**
 * The intended id-to-company mapping, restated independently of the registry so
 * a transposition has something to disagree with. The library's login-field
 * lists collide heavily — nine companies declare `["username","password"]` and
 * `discount`/`mercantile` both declare `["id","password","num"]` — so the
 * field-key cross-check below cannot detect a wrong company on its own.
 *
 * This mirrors `BANK_COMPANY_MAP` in `src/lib/scraper/index.ts`, the one
 * sanctioned site outside the registry (ADR-0013); the two must agree.
 */
const EXPECTED_COMPANY: Record<string, CompanyTypes> = {
  discount: CompanyTypes.discount,
  max: CompanyTypes.max,
  visaCal: CompanyTypes.visaCal,
  hapoalim: CompanyTypes.hapoalim,
  leumi: CompanyTypes.leumi,
  mizrahi: CompanyTypes.mizrahi,
  mercantile: CompanyTypes.mercantile,
  beinleumi: CompanyTypes.beinleumi,
  otsarHahayal: CompanyTypes.otsarHahayal,
  massad: CompanyTypes.massad,
  pagi: CompanyTypes.pagi,
  yahav: CompanyTypes.yahav,
  union: CompanyTypes.union,
  isracard: CompanyTypes.isracard,
  amex: CompanyTypes.amex,
  beyahadBishvilha: CompanyTypes.beyahadBishvilha,
  behatsdaa: CompanyTypes.behatsdaa,
};

/**
 * Login-field names the library declares that a user never types, and which our
 * curated descriptors therefore must not carry:
 *   - `otpCodeRetriever` is a callback the caller supplies, not a value;
 *   - `otpLongTermToken` is an MFA token issued by a previous login.
 *
 * Surveyed across all of the library's companies, not only the ones registered
 * here, so an institution promoted out of the experimental tier is measured
 * against the same list. Every other declared name is a value the user enters.
 */
const NON_USER_ENTERED_LOGIN_FIELDS: readonly string[] = ["otpCodeRetriever", "otpLongTermToken"];

function userEnteredLoginFields(company: CompanyTypes): string[] {
  return SCRAPERS[company].loginFields
    .filter((field) => !NON_USER_ENTERED_LOGIN_FIELDS.includes(field))
    .sort();
}

const ENTRY_CASES = enabledBankEntries().map((entry) => [entry.id, entry] as const);
const EXPERIMENTAL_CASES = ENTRY_CASES.filter(([, entry]) => entry.tier === "experimental");

const SCRAPERS_DIR = path.join(
  path.dirname(require.resolve("israeli-bank-scrapers-core/lib/definitions")),
  "scrapers",
);

/** The library factory's `case CompanyTypes.x: return new _y.default` plus `_y = require("./file")`. */
function scraperFileOf(company: CompanyTypes): string {
  const factory = readFileSync(path.join(SCRAPERS_DIR, "factory.js"), "utf8");
  const binding = new RegExp(`CompanyTypes\\.${company}:\\s*return new (\\w+)\\.default`).exec(
    factory,
  )?.[1];
  const file = binding
    ? new RegExp(`var ${binding} = _interopRequireDefault\\(require\\("\\./([\\w-]+)"\\)\\)`).exec(
        factory,
      )?.[1]
    : undefined;
  if (!file) throw new Error(`no scraper file found for ${company}`);
  return file;
}

/** Follows the scraper's local requires, since a shared base class may be what asks. */
function scraperConsumesOtpRetriever(company: CompanyTypes): boolean {
  const queue = [scraperFileOf(company)];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(path.join(SCRAPERS_DIR, `${file}.js`), "utf8");
    if (/\botpCodeRetriever\b/.test(source)) return true;
    for (const match of source.matchAll(/require\("\.\/([\w-]+)"\)/g)) queue.push(match[1]);
  }
  return false;
}

describe("registry entries cross-checked against the scraper library", () => {
  it.each(ENTRY_CASES)(
    "%s declares exactly the library's user-entered login fields",
    (_id, entry) => {
      const declared = entry.credentialFields.map((field) => field.key).sort();
      expect(declared).toEqual(userEnteredLoginFields(entry.company));
    },
  );

  it.each(ENTRY_CASES)("%s names a company the library still supports", (_id, entry) => {
    expect(SCRAPERS[entry.company]).toBeDefined();
    expect(Object.values(CompanyTypes)).toContain(entry.company);
  });

  it.each(ENTRY_CASES)("%s drives the scraper company it is meant to drive", (id, entry) => {
    expect(entry.company).toBe(EXPECTED_COMPANY[id]);
  });

  it("maps every registered institution to a distinct company", () => {
    const companies = enabledBankEntries().map((entry) => entry.company);
    expect(new Set(companies).size).toBe(companies.length);
  });

  it.each(ENTRY_CASES)(
    "%s marks the library's password field secret, and only that field",
    (_id, entry) => {
      const secretKeys = entry.credentialFields
        .filter((field) => field.kind === "password")
        .map((field) => field.key);
      expect(secretKeys).toEqual([PASSWORD_FIELD]);
    },
  );

  it.each(ENTRY_CASES)(
    "%s declares each field once, so a form cannot render a duplicate input",
    (_id, entry) => {
      const keys = entry.credentialFields.map((field) => field.key);
      expect(new Set(keys).size).toBe(keys.length);
    },
  );

  it("excludes only names the library actually declares, so the exclusion list cannot rot", () => {
    const everyDeclaredField = Object.values(SCRAPERS).flatMap((scraper) => scraper.loginFields);
    for (const excluded of NON_USER_ENTERED_LOGIN_FIELDS) {
      expect(everyDeclaredField).toContain(excluded);
    }
  });

  /**
   * The verified entries' `issuesOtp` is our own product record and is not
   * re-derived here. An experimental entry has no such record, so its flag must
   * agree with the library: true exactly when its scraper (or a local module it
   * builds on) reads the OTP retriever. Re-read on every run, so an upgrade that
   * teaches a scraper to ask for a code fails until its entry is re-classified.
   */
  it.each(EXPERIMENTAL_CASES)(
    "%s claims an OTP exactly when its library scraper consumes the retriever",
    (_id, entry) => {
      expect(entry.issuesOtp).toBe(scraperConsumesOtpRetriever(entry.company));
    },
  );

  it("detects a scraper that consumes the retriever, so the check above is not vacuous", () => {
    expect(scraperConsumesOtpRetriever(CompanyTypes.oneZero)).toBe(true);
  });
});
