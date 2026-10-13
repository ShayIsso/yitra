import { describe, it, expect } from "vitest";
import {
  credentialFieldKinds,
  isSecretFieldKind,
  credentialFieldRendering,
  credentialSchemaFor,
  nonSecretCredentialValues,
  type BankRegistryEntry,
} from "../index";
import { registered } from "./registered";

/** A card issuer that identifies the cardholder by the last six digits of the card. */
const sixDigitEntry: BankRegistryEntry = {
  ...registered("max"),
  credentialFields: [{ key: "card6", kind: "card-6-digits", label: "שש ספרות אחרונות" }],
};

describe("credentialFieldKinds", () => {
  it("is closed, so a sixth kind cannot be added without a deliberate code change", () => {
    expect(credentialFieldKinds).toEqual([
      "text",
      "password",
      "national-id",
      "account-number",
      "card-6-digits",
    ]);
  });

  it("gives every kind an input rendering a generic form can apply without branching", () => {
    for (const kind of credentialFieldKinds) {
      const rendering = credentialFieldRendering(kind);
      expect(["text", "password"]).toContain(rendering.inputType);
      expect(["text", "numeric"]).toContain(rendering.inputMode);
    }
  });

  it("gives every kind a Zod rule with a Hebrew message", () => {
    for (const kind of credentialFieldKinds) {
      const schema = credentialSchemaFor({
        ...registered("max"),
        credentialFields: [{ key: "field", kind, label: "שדה" }],
      });
      const result = schema.safeParse({ field: "" });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toMatch(/^שדה /);
    }
  });
});

describe("isSecretFieldKind", () => {
  it("marks the password kind secret", () => {
    expect(isSecretFieldKind("password")).toBe(true);
  });

  it("marks no other kind secret, leaving ids and account numbers to the redaction boundary", () => {
    expect(credentialFieldKinds.filter(isSecretFieldKind)).toEqual(["password"]);
  });
});

describe("credentialFieldRendering", () => {
  it("renders the password kind masked", () => {
    expect(credentialFieldRendering("password").inputType).toBe("password");
  });

  it("renders a national id with a numeric keypad and no masking", () => {
    expect(credentialFieldRendering("national-id")).toEqual({
      inputType: "text",
      inputMode: "numeric",
    });
  });
});

describe("credentialSchemaFor", () => {
  it("builds a schema over exactly the institution's field keys", () => {
    const parsed = credentialSchemaFor(registered("discount")).parse({
      id: "000000001",
      password: "sample-secret",
      num: "000123",
      unexpected: "dropped",
    });
    expect(parsed).toEqual({ id: "000000001", password: "sample-secret", num: "000123" });
  });

  it("rejects a blank field with a Hebrew message naming that field", () => {
    const result = credentialSchemaFor(registered("discount")).safeParse({
      id: "",
      password: "sample-secret",
      num: "000123",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("תעודת זהות חובה");
  });

  it("rejects a missing field rather than defaulting it", () => {
    const result = credentialSchemaFor(registered("max")).safeParse({ username: "sample-user" });
    expect(result.success).toBe(false);
  });

  it("accepts a card issuer's internet username and password", () => {
    const result = credentialSchemaFor(registered("visaCal")).safeParse({
      username: "sample-user",
      password: "sample-secret",
    });
    expect(result.success).toBe(true);
  });

  it("requires the six-digit kind to be exactly six digits", () => {
    const schema = credentialSchemaFor(sixDigitEntry);
    expect(schema.safeParse({ card6: "000000" }).success).toBe(true);
    expect(schema.safeParse({ card6: "00000" }).success).toBe(false);
    expect(schema.safeParse({ card6: "0000000" }).success).toBe(false);
    expect(schema.safeParse({ card6: "00000a" }).success).toBe(false);
  });

  it("rejects a blank six-digit field with a Hebrew message naming that field", () => {
    const result = credentialSchemaFor(sixDigitEntry).safeParse({ card6: "" });
    expect(result.error?.issues[0]?.message).toBe("שש ספרות אחרונות חייב להכיל שש ספרות");
  });
});

describe("credentialSchemaFor with blank secrets allowed", () => {
  const editSchema = () => credentialSchemaFor(registered("discount"), { allowBlankSecrets: true });

  it("accepts a blank secret-kind field", () => {
    const result = editSchema().safeParse({ id: "000000001", password: "", num: "000123" });
    expect(result.success).toBe(true);
  });

  it("still requires every non-secret field, with its Hebrew message", () => {
    const result = editSchema().safeParse({ id: "", password: "", num: "000123" });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["תעודת זהות חובה"]);
  });

  it("still rejects a missing secret-kind field rather than defaulting it", () => {
    const result = editSchema().safeParse({ id: "000000001", num: "000123" });
    expect(result.success).toBe(false);
  });

  it("keeps a non-secret kind's shape rule, so a six-digit field stays exactly six digits", () => {
    const schema = credentialSchemaFor(
      {
        ...sixDigitEntry,
        credentialFields: [
          ...sixDigitEntry.credentialFields,
          { key: "password", kind: "password", label: "סיסמה" },
        ],
      },
      { allowBlankSecrets: true },
    );
    expect(schema.safeParse({ card6: "000000", password: "" }).success).toBe(true);
    expect(schema.safeParse({ card6: "0000", password: "" }).success).toBe(false);
  });
});

describe("nonSecretCredentialValues", () => {
  const SYNTHETIC_SECRET = "synthetic-secret-value";

  it("returns exactly the institution's non-secret fields and never its password", () => {
    const stored = { id: "000000001", password: SYNTHETIC_SECRET, num: "000123" };
    const safe = nonSecretCredentialValues(registered("discount").credentialFields, stored);
    expect(safe).toEqual({ id: "000000001", num: "000123" });
    expect(JSON.stringify(safe)).not.toContain(SYNTHETIC_SECRET);
  });

  it("strips by field kind whatever the secret field is keyed as", () => {
    const fields = [
      { key: "card6", kind: "card-6-digits", label: "שש ספרות אחרונות" },
      { key: "userCode", kind: "text", label: "קוד משתמש" },
      { key: "loginSecret", kind: "password", label: "סיסמה" },
    ] as const;
    const safe = nonSecretCredentialValues(fields, {
      card6: "000000",
      userCode: "sample-code",
      loginSecret: SYNTHETIC_SECRET,
    });
    expect(safe).toEqual({ card6: "000000", userCode: "sample-code" });
  });

  it("drops stored keys the institution does not declare, so only declared fields can leak", () => {
    const safe = nonSecretCredentialValues(registered("max").credentialFields, {
      username: "sample-user",
      password: SYNTHETIC_SECRET,
      legacyToken: SYNTHETIC_SECRET,
    });
    expect(safe).toEqual({ username: "sample-user" });
  });

  it("returns nothing for an institution with no declared fields", () => {
    expect(nonSecretCredentialValues([], { username: "sample-user" })).toEqual({});
  });

  it("omits a declared field the stored row does not carry instead of inventing a value", () => {
    const safe = nonSecretCredentialValues(registered("discount").credentialFields, {
      id: "000000001",
    });
    expect(safe).toEqual({ id: "000000001" });
  });
});
