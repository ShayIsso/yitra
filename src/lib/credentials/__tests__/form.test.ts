import { describe, it, expect } from "vitest";
import type { BankRegistryEntry } from "@/lib/bank-registry";
import { registered } from "@/lib/bank-registry/__tests__/registered";
import { syntheticIssuer } from "@/lib/bank-registry/__tests__/synthetic-entries";
import { emptyCredentialValues, planCredentialEdit } from "../form";

const PREFILL = { card6Digits: "000000", userCode: "sample-code" };

describe("emptyCredentialValues", () => {
  it("starts every one of the institution's fields blank, and no other", () => {
    expect(emptyCredentialValues(syntheticIssuer)).toEqual({
      card6Digits: "",
      userCode: "",
      password: "",
    });
  });
});

describe("planCredentialEdit", () => {
  it("keeps the stored credentials when the secret is blank and nothing else changed", () => {
    const plan = planCredentialEdit(syntheticIssuer, { ...PREFILL, password: "" }, PREFILL);

    expect(plan).toEqual({ kind: "keep" });
  });

  it("demands the secret when another login field changed without one", () => {
    const plan = planCredentialEdit(
      syntheticIssuer,
      { ...PREFILL, userCode: "other-code", password: "" },
      PREFILL,
    );

    expect(plan).toEqual({ kind: "needs-secret", field: "password" });
  });

  it("replaces with exactly the institution's fields once a new secret is typed", () => {
    const plan = planCredentialEdit(
      syntheticIssuer,
      { ...PREFILL, password: "sample-secret", username: "leftover" },
      PREFILL,
    );

    expect(plan).toEqual({
      kind: "replace",
      credentials: { card6Digits: "000000", userCode: "sample-code", password: "sample-secret" },
    });
  });

  it("demands every secret once any one of them is typed, rather than dropping the typed one", () => {
    const twoSecrets: BankRegistryEntry = {
      ...syntheticIssuer,
      credentialFields: [
        { key: "userCode", kind: "text", label: "קוד משתמש" },
        { key: "password", kind: "password", label: "סיסמה" },
        { key: "pin", kind: "password", label: "קוד סודי" },
      ],
    };

    const plan = planCredentialEdit(
      twoSecrets,
      { userCode: "sample-code", password: "sample-secret", pin: "" },
      { userCode: "sample-code" },
    );

    expect(plan).toEqual({ kind: "needs-secret", field: "pin" });
  });

  it("treats a field missing from the prefill as blank, so typing into it counts as a change", () => {
    const plan = planCredentialEdit(
      registered("discount"),
      { id: "000000001", num: "000123", password: "" },
      { id: "000000001" },
    );

    expect(plan).toEqual({ kind: "needs-secret", field: "password" });
  });
});
