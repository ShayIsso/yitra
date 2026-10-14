import { describe, it, expect } from "vitest";
import { formatZodFieldErrors } from "@/lib/api-utils";
import { registered } from "@/lib/bank-registry/__tests__/registered";
import { syntheticIssuer } from "@/lib/bank-registry/__tests__/synthetic-entries";
import { credentialBoundarySchemas, storedCredentialSchema } from "../schemas";

const schemas = credentialBoundarySchemas([registered("discount"), syntheticIssuer]);

const ROW_ID = "3f8a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";
const SYNTHETIC_ISSUER_FIELDS = {
  card6Digits: "000000",
  userCode: "sample-code",
  password: "sample-secret",
};

function fieldErrorsOf(result: { success: boolean; error?: unknown }) {
  expect(result.success).toBe(false);
  return formatZodFieldErrors(result.error as Parameters<typeof formatZodFieldErrors>[0]);
}

describe("add schema", () => {
  it("validates an institution with a field kind none of the verified ones use", () => {
    const result = schemas.add.safeParse({
      bankType: "syntheticIssuer",
      displayName: "כרטיס בדיקה",
      credentials: { ...SYNTHETIC_ISSUER_FIELDS, card6Digits: "00000" },
    });

    expect(fieldErrorsOf(result)).toEqual({
      "credentials.card6Digits": "שש ספרות אחרונות חייב להכיל שש ספרות",
    });
  });

  it("accepts exactly the selected institution's fields and drops any other", () => {
    const parsed = schemas.add.parse({
      bankType: "syntheticIssuer",
      displayName: "כרטיס בדיקה",
      credentials: { ...SYNTHETIC_ISSUER_FIELDS, id: "000000001", num: "000123" },
    });

    expect(parsed).toEqual({
      bankType: "syntheticIssuer",
      displayName: "כרטיס בדיקה",
      credentials: SYNTHETIC_ISSUER_FIELDS,
    });
  });

  it("reports a blank display name and blank credential fields together", () => {
    const result = schemas.add.safeParse({
      bankType: "discount",
      displayName: " ",
      credentials: { id: "", password: "", num: "" },
    });

    expect(fieldErrorsOf(result)).toEqual({
      displayName: "שם תצוגה חובה",
      "credentials.id": "תעודת זהות חובה",
      "credentials.password": "סיסמה חובה",
      "credentials.num": "מספר חשבון חובה",
    });
  });

  it("rejects an institution the registry does not list with a Hebrew message", () => {
    const result = schemas.add.safeParse({
      bankType: "max",
      displayName: "כרטיס בדיקה",
      credentials: { username: "sample-user", password: "sample-secret" },
    });

    expect(fieldErrorsOf(result)).toEqual({ bankType: "מוסד לא נתמך" });
  });
});

describe("edit schema", () => {
  it("accepts a blank secret-kind field, meaning keep the stored value", () => {
    const result = schemas.edit.safeParse({
      bankType: "syntheticIssuer",
      displayName: "כרטיס בדיקה",
      credentials: { ...SYNTHETIC_ISSUER_FIELDS, password: "" },
    });

    expect(result.success).toBe(true);
  });

  it("still requires every non-secret field so a prefilled value cannot be cleared", () => {
    const result = schemas.edit.safeParse({
      bankType: "syntheticIssuer",
      displayName: "כרטיס בדיקה",
      credentials: { card6Digits: "000000", userCode: "", password: "" },
    });

    expect(fieldErrorsOf(result)).toEqual({ "credentials.userCode": "קוד משתמש חובה" });
  });
});

describe("update schema", () => {
  it("accepts a display-name-only update with no credentials", () => {
    const parsed = schemas.update.parse({
      id: ROW_ID,
      bankType: "syntheticIssuer",
      displayName: "שם חדש",
    });

    expect(parsed).toEqual({ id: ROW_ID, bankType: "syntheticIssuer", displayName: "שם חדש" });
  });

  it("validates replacement credentials in full, a blank secret included", () => {
    const result = schemas.update.safeParse({
      id: ROW_ID,
      bankType: "syntheticIssuer",
      displayName: "כרטיס בדיקה",
      credentials: { ...SYNTHETIC_ISSUER_FIELDS, password: "" },
    });

    expect(fieldErrorsOf(result)).toEqual({ "credentials.password": "סיסמה חובה" });
  });
});

describe("storedCredentialSchema", () => {
  it("rejects a payload shaped for a different institution than the stored one", () => {
    const forged = storedCredentialSchema("discount").safeParse({
      username: "sample-user",
      password: "sample-secret",
    });

    expect(forged.success).toBe(false);
  });

  it("accepts the stored institution's own fields", () => {
    const result = storedCredentialSchema("max").safeParse({
      username: "sample-user",
      password: "sample-secret",
    });

    expect(result.success).toBe(true);
  });

  it("accepts nothing for a stored institution no longer registered", () => {
    const result = storedCredentialSchema("retiredInstitution").safeParse({
      username: "sample-user",
      password: "sample-secret",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("מוסד לא נתמך");
  });
});
