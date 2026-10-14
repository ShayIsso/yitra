import { describe, it, expect } from "vitest";
import {
  addCredentialSchema,
  editCredentialSchema,
  updateCredentialSchema,
  storedCredentialSchema,
} from "../schemas";

const ROW_ID = "3f8a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";
const EXCLUDED_ID = "oneZero";
/** Every key the excluded institution's library login declares, user-entered or not. */
const EXCLUDED_LOGIN = {
  email: "owner@example.test",
  password: "sample-secret",
  phoneNumber: "000",
  otpLongTermToken: "sample-token",
};

describe("the excluded institution at the credential boundary", () => {
  it("is refused by the add schema with the unsupported-institution message", () => {
    const result = addCredentialSchema.safeParse({
      bankType: EXCLUDED_ID,
      displayName: "חשבון",
      credentials: EXCLUDED_LOGIN,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["מוסד לא נתמך"]);
  });

  it("is refused by the edit and update schemas", () => {
    expect(
      editCredentialSchema.safeParse({
        bankType: EXCLUDED_ID,
        displayName: "חשבון",
        credentials: EXCLUDED_LOGIN,
      }).success,
    ).toBe(false);
    expect(
      updateCredentialSchema.safeParse({ id: ROW_ID, bankType: EXCLUDED_ID, displayName: "חשבון" })
        .success,
    ).toBe(false);
  });

  it("accepts nothing as a stored credential", () => {
    expect(storedCredentialSchema(EXCLUDED_ID).safeParse(EXCLUDED_LOGIN).success).toBe(false);
  });
});

describe("an experimental institution at the credential boundary", () => {
  it("is accepted through the same schema as a verified one", () => {
    const parsed = addCredentialSchema.parse({
      bankType: "isracard",
      displayName: "כרטיס",
      credentials: { id: "000000001", card6Digits: "000000", password: "sample-secret" },
    });
    expect(parsed.bankType).toBe("isracard");
  });

  it("reports a malformed six-digit card field in Hebrew", () => {
    const result = addCredentialSchema.safeParse({
      bankType: "isracard",
      displayName: "כרטיס",
      credentials: { id: "000000001", card6Digits: "0000", password: "sample-secret" },
    });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "מספר כרטיס חייב להכיל שש ספרות",
    ]);
  });
});
