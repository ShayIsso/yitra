import { describe, it, expect, vi, beforeEach } from "vitest";
import { isBankType } from "@/lib/bank-registry";

// The institution column is plain text (ADR-0013 §4), so every Server Action
// that accepts an institution id must refuse an unregistered one itself.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/credentials", () => ({
  addCredential: vi.fn(),
  updateCredential: vi.fn(),
  removeCredential: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { updateCredential } from "@/lib/credentials";
import { updateCredentialAction } from "@/app/actions/credentials";

const UNREGISTERED = "not-a-registered-institution";
const ROW_ID = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateCredentialAction with an institution id absent from the registry", () => {
  it("uses an id the registry does not know", () => {
    expect(isBankType(UNREGISTERED)).toBe(false);
  });

  it("is refused at the boundary without touching the module", async () => {
    const result = await updateCredentialAction({
      id: ROW_ID,
      bankType: UNREGISTERED,
      displayName: "שם בדיקה",
      credentials: { username: "fake-user", password: "fake-password" },
    });

    expect(result.error).toBeTruthy();
    expect(updateCredential).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
