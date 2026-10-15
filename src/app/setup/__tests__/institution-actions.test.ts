import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireSession: vi.fn() };
});

vi.mock("@/lib/credentials", () => ({ addCredential: vi.fn() }));

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { addCredential } from "@/lib/credentials";
import {
  enabledBankEntries,
  excludedInstitutions,
  isSecretFieldKind,
  type BankRegistryEntry,
  type CredentialFieldKind,
} from "@/lib/bank-registry";
import { addInstitutionCredentialAction } from "../institution-actions";

const FAKE_SECRET = "fake-secret-for-tests-only";

const SYNTHETIC_VALUE: Record<CredentialFieldKind, string> = {
  text: "fake-user",
  password: FAKE_SECRET,
  "national-id": "000000000",
  "account-number": "000000",
  "card-6-digits": "000000",
};

function syntheticInput(entry: BankRegistryEntry) {
  return {
    bankType: entry.id,
    displayName: "חשבון בדיקה",
    credentials: Object.fromEntries(
      entry.credentialFields.map((field) => [field.key, SYNTHETIC_VALUE[field.kind]]),
    ),
  };
}

const [firstEntry] = enabledBankEntries();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue(undefined);
  vi.mocked(addCredential).mockResolvedValue("3f8a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c");
});

describe("addInstitutionCredentialAction without a session", () => {
  it("stores nothing", async () => {
    const signInRedirect = new Error("NEXT_REDIRECT");
    vi.mocked(requireSession).mockRejectedValue(signInRedirect);

    await expect(addInstitutionCredentialAction(syntheticInput(firstEntry))).rejects.toBe(
      signInRedirect,
    );
    expect(requireSession).toHaveBeenCalledWith("/setup");
    expect(addCredential).not.toHaveBeenCalled();
  });
});

describe("addInstitutionCredentialAction", () => {
  it.each(enabledBankEntries().map((entry) => [entry.id, entry] as const))(
    "stores a valid %s credential through the credentials module",
    async (_id, entry) => {
      const input = syntheticInput(entry);
      const result = await addInstitutionCredentialAction(input);

      expect(addCredential).toHaveBeenCalledWith(
        input.bankType,
        input.displayName,
        input.credentials,
      );
      expect(result).toEqual({ added: true });
    },
  );

  it("refreshes the pages that list credentials once one is stored", async () => {
    await addInstitutionCredentialAction(syntheticInput(firstEntry));
    for (const page of ["/settings", "/sync", "/", "/transactions"]) {
      expect(revalidatePath).toHaveBeenCalledWith(page);
    }
  });

  it("refreshes nothing when the store fails", async () => {
    vi.mocked(addCredential).mockRejectedValue(new Error("write failed"));
    await addInstitutionCredentialAction(syntheticInput(firstEntry));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("answers each blank field with its own Hebrew error and stores nothing", async () => {
    const input = syntheticInput(firstEntry);
    const blankFields = Object.fromEntries(firstEntry.credentialFields.map((f) => [f.key, ""]));
    const result = await addInstitutionCredentialAction({
      ...input,
      displayName: "",
      credentials: blankFields,
    });

    expect(result.fieldErrors?.displayName).toBe("שם תצוגה חובה");
    for (const field of firstEntry.credentialFields) {
      expect(result.fieldErrors?.[`credentials.${field.key}`]).toBe(`${field.label} חובה`);
    }
    expect(result.added).toBeUndefined();
    expect(addCredential).not.toHaveBeenCalled();
  });

  it("does not echo a typed secret back when another field is invalid", async () => {
    const input = syntheticInput(firstEntry);
    const result = await addInstitutionCredentialAction({ ...input, displayName: " " });

    expect(result.fieldErrors?.displayName).toBeTruthy();
    expect(firstEntry.credentialFields.some((f) => isSecretFieldKind(f.kind))).toBe(true);
    expect(JSON.stringify(result)).not.toContain(FAKE_SECRET);
  });

  it("rejects non-object input without touching the module", async () => {
    const result = await addInstitutionCredentialAction("not an object");
    expect(result.error).toBeTruthy();
    expect(addCredential).not.toHaveBeenCalled();
  });

  it("answers a failed store with a fixed Hebrew message carrying nothing of the error", async () => {
    const queryError = Object.assign(
      new Error(`Failed query: insert into "bank_credentials" params: ${FAKE_SECRET}`),
      { params: [FAKE_SECRET], cause: new Error(`connection dropped mid-write: ${FAKE_SECRET}`) },
    );
    vi.mocked(addCredential).mockRejectedValue(queryError);

    const result = await addInstitutionCredentialAction(syntheticInput(firstEntry));

    expect(Object.keys(result)).toEqual(["error"]);
    expect(result.error).toMatch(/[֐-׿]/);
    expect(result.error).not.toContain(FAKE_SECRET);
    expect(result.error).not.toContain("Failed query");
    expect(JSON.stringify(result)).not.toContain(FAKE_SECRET);
    expect(result).not.toHaveProperty("stack");
    expect(result).not.toHaveProperty("cause");
  });

  it.each([
    ["an excluded institution", excludedInstitutions[0].company],
    ["an unregistered institution", "not-an-institution"],
  ])("refuses %s", async (_case, bankType) => {
    const result = await addInstitutionCredentialAction({
      ...syntheticInput(firstEntry),
      bankType,
    });

    expect(result.fieldErrors?.bankType).toBe("מוסד לא נתמך");
    expect(addCredential).not.toHaveBeenCalled();
  });
});
