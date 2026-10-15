import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError } from "zod";
import { isBankType } from "@/lib/bank-registry";

// The institution column is plain text (ADR-0013 §4), so a stored credential
// row can name an institution later removed from the registry. Replacing its
// credentials must be refused by the same boundary rule an incoming id meets.

const RETIRED_ID = "retired-institution";
const ROW_ID = "33333333-3333-4333-8333-333333333333";

const { findFirst, update } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { query: { bankCredentials: { findFirst } }, update },
}));
vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn(() => ({
    encrypted: Buffer.alloc(0),
    iv: Buffer.alloc(0),
    authTag: Buffer.alloc(0),
  })),
  decrypt: vi.fn(() => JSON.stringify({ username: "fake-user", password: "fake-password" })),
}));

import { getDecryptedCredentials, updateCredential } from "@/lib/credentials";

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue({
    bankType: RETIRED_ID,
    encryptedCredentials: Buffer.alloc(0),
    iv: Buffer.alloc(0),
    authTag: Buffer.alloc(0),
  });
});

describe("a stored credential naming an unregistered institution", () => {
  it("uses an id the registry does not know", () => {
    expect(isBankType(RETIRED_ID)).toBe(false);
  });

  it("stays readable, carrying the stored id as-is", async () => {
    const { bankType } = await getDecryptedCredentials(ROW_ID);

    expect(bankType).toBe(RETIRED_ID);
  });

  it("refuses a credential replacement with the boundary's unsupported-institution error", async () => {
    const attempt = updateCredential(ROW_ID, {
      rawCredentials: { username: "fake-user", password: "fake-password" },
    });

    await expect(attempt).rejects.toBeInstanceOf(ZodError);
    await expect(attempt).rejects.toThrow("מוסד לא נתמך");
    expect(update).not.toHaveBeenCalled();
  });
});
