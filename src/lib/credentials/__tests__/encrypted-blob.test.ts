import { describe, it, expect, vi, beforeEach } from "vitest";

// The encrypted blob is handed whole to the scraper at sync time, so only the
// stored institution's declared fields may ever be persisted, whichever caller
// reaches the module (the action boundary strips too, but is not the only door).

const ROW_ID = "44444444-4444-4444-8444-444444444444";

const { findFirst, insert, update, encrypt } = vi.hoisted(() => {
  const returning = vi.fn(async () => [{ id: "44444444-4444-4444-8444-444444444444" }]);
  const where = vi.fn(async () => undefined);
  return {
    findFirst: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where })) })),
    encrypt: vi.fn((plaintext: string) => {
      void plaintext;
      return { encrypted: Buffer.alloc(0), iv: Buffer.alloc(0), authTag: Buffer.alloc(0) };
    }),
  };
});

vi.mock("@/db", () => ({
  db: { query: { bankCredentials: { findFirst } }, insert, update },
}));
vi.mock("@/lib/crypto", () => ({ encrypt, decrypt: vi.fn() }));

import { addCredential, updateCredential } from "@/lib/credentials";

function encryptedPlaintext(): Record<string, string> {
  return JSON.parse(encrypt.mock.calls[0][0]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the encrypted credential blob", () => {
  it("holds only the institution's declared fields when a credential is added", async () => {
    await addCredential("max", "כרטיס בדיקה", {
      username: "sample-user",
      password: "sample-secret",
      smuggled: "sample-extra",
    });

    expect(encryptedPlaintext()).toEqual({ username: "sample-user", password: "sample-secret" });
  });

  it("holds only the stored institution's declared fields when credentials are replaced", async () => {
    findFirst.mockResolvedValue({ bankType: "discount" });

    await updateCredential(ROW_ID, {
      rawCredentials: {
        id: "000000001",
        password: "sample-secret",
        num: "000123",
        username: "sample-extra",
      },
    });

    expect(encryptedPlaintext()).toEqual({
      id: "000000001",
      password: "sample-secret",
      num: "000123",
    });
  });
});
