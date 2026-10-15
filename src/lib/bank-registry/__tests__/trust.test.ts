import { describe, it, expect } from "vitest";
import { bankTrustOf, resolveBankTrust, type BankRegistryEntry } from "../index";
import { registered } from "./registered";

const verifiedEntry: BankRegistryEntry = registered("discount");
const experimentalEntry: BankRegistryEntry = { ...registered("discount"), tier: "experimental" };

describe("resolveBankTrust", () => {
  it("keeps a verified institution verified before this install has synced it", () => {
    expect(resolveBankTrust({ entry: verifiedEntry, hasRecordedSuccessfulSync: false })).toBe(
      "verified",
    );
  });

  it("keeps a verified institution verified after a successful sync too", () => {
    expect(resolveBankTrust({ entry: verifiedEntry, hasRecordedSuccessfulSync: true })).toBe(
      "verified",
    );
  });

  it("caveats an experimental institution this install has never synced", () => {
    expect(resolveBankTrust({ entry: experimentalEntry, hasRecordedSuccessfulSync: false })).toBe(
      "experimental",
    );
  });

  it("retires the caveat once this install has recorded a successful sync", () => {
    expect(resolveBankTrust({ entry: experimentalEntry, hasRecordedSuccessfulSync: true })).toBe(
      "observed",
    );
  });

  it("never reports an install's own evidence as something we verified", () => {
    expect(
      resolveBankTrust({ entry: experimentalEntry, hasRecordedSuccessfulSync: true }),
    ).not.toBe("verified");
  });
});

describe("bankTrustOf", () => {
  const noEvidence = new Set<string>();

  it("caveats an experimental institution when this install has no evidence for it", () => {
    expect(bankTrustOf("isracard", noEvidence)).toBe("experimental");
  });

  it("retires the caveat for an institution in this install's evidence", () => {
    expect(bankTrustOf("isracard", new Set(["isracard"]))).toBe("observed");
  });

  it("does not let one institution's evidence retire another's caveat", () => {
    expect(bankTrustOf("amex", new Set(["isracard"]))).toBe("experimental");
  });

  it("keeps a verified institution verified with or without evidence", () => {
    expect(bankTrustOf("discount", noEvidence)).toBe("verified");
    expect(bankTrustOf("discount", new Set(["discount"]))).toBe("verified");
  });

  it("has no trust for an unregistered or excluded id, even with evidence for it", () => {
    const removed = "institution-that-was-removed";
    expect(bankTrustOf(removed, new Set([removed]))).toBeUndefined();
    expect(bankTrustOf("oneZero", new Set(["oneZero"]))).toBeUndefined();
  });
});
