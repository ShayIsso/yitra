import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
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
 * This mirrors `BANK_COMPANY_MAP` in `src/lib/scraper/index.ts`, which #255
 * retires in favour of the registry; until then the two must agree.
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
   * `issuesOtp` of every experimental entry was set by reading whether its
   * scraper asks the caller for a code. This re-reads the library on every run,
   * so an upgrade that teaches another scraper to ask fails here until its entry
   * is re-classified.
   */
  it("finds no library scraper that asks for an OTP code besides the excluded one", () => {
    const scrapersDir = path.join(
      path.dirname(require.resolve("israeli-bank-scrapers-core/lib/definitions")),
      "scrapers",
    );
    const asking = readdirSync(scrapersDir)
      .filter((file) => file.endsWith(".js") && !file.endsWith(".test.js"))
      .filter((file) =>
        /\.otpCodeRetriever\b/.test(readFileSync(path.join(scrapersDir, file), "utf8")),
      );
    expect(asking).toEqual(["one-zero.js"]);
  });
});
