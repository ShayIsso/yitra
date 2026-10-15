import { describe, it, expect } from "vitest";
import { CompanyTypes } from "israeli-bank-scrapers-core/lib/definitions";
import {
  bankRegistry,
  enabledBankEntries,
  excludedInstitutions,
  isBankType,
  type BankRegistryEntry,
} from "../index";

const EXCLUDED_ID = "oneZero";

describe("every institution the scraper library supports is classified", () => {
  /**
   * A library upgrade that adds a company lands here: it is neither registered
   * nor excluded until someone decides which, so the upgrade cannot silently
   * ship an institution nobody looked at — or silently omit one.
   */
  it.each(Object.values(CompanyTypes))(
    "%s is either registered or explicitly excluded",
    (company) => {
      const registered = bankRegistry.some((entry) => entry.company === company);
      const excluded = excludedInstitutions.some((exclusion) => exclusion.company === company);
      expect(registered || excluded).toBe(true);
    },
  );

  it("never both registers and excludes the same company", () => {
    for (const exclusion of excludedInstitutions) {
      expect(bankRegistry.map((entry) => entry.company)).not.toContain(exclusion.company);
    }
  });

  it("gives every exclusion a stated reason", () => {
    for (const exclusion of excludedInstitutions) {
      expect(exclusion.reason.trim()).not.toBe("");
    }
  });
});

describe("the institution whose login needs an unattended MFA token", () => {
  it("is excluded by declaration, not by mere absence", () => {
    expect(excludedInstitutions.map((exclusion) => exclusion.company)).toEqual([
      CompanyTypes.oneZero,
    ]);
  });

  it("is not an institution id", () => {
    expect(isBankType(EXCLUDED_ID)).toBe(false);
  });

  it("is never offered for selection", () => {
    expect(enabledBankEntries().map((entry) => entry.id)).not.toContain(EXCLUDED_ID);
    expect(enabledBankEntries().map((entry) => entry.company)).not.toContain(CompanyTypes.oneZero);
  });

  it("cannot be written into a registry entry", () => {
    const entry = {
      ...enabledBankEntries()[0],
      // @ts-expect-error an excluded company is not a company an entry may drive
      company: CompanyTypes.oneZero,
    } satisfies BankRegistryEntry;
    expect(entry).toBeTruthy();
  });
});
