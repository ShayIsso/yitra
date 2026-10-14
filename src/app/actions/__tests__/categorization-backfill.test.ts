import { describe, it, expect, vi, beforeEach } from "vitest";

// Action-seam tests: the sync module and Next's cache are mocked, so these
// verify the boundary — each backfill outcome maps to a summary or a Hebrew
// refusal, and only a completed run revalidates.

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/sync", () => ({
  backfillCategorization: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { backfillCategorization } from "@/lib/sync";
import { backfillCategorizationAction } from "@/app/actions/categorization-backfill";

const backfill = vi.mocked(backfillCategorization);
const HEBREW = /[֐-׿]/;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("backfillCategorizationAction", () => {
  it("reports the run's summary and refreshes the transaction pages", async () => {
    backfill.mockResolvedValue({
      status: "completed",
      summary: { applied: 3, queued: 2, skipped: 1 },
    });

    const result = await backfillCategorizationAction();

    expect(result).toEqual({ summary: { applied: 3, queued: 2, skipped: 1 } });
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it.each(["provider_off", "sync_running", "incomplete"] as const)(
    "refuses a %s outcome with a Hebrew message and no refresh",
    async (status) => {
      backfill.mockResolvedValue({ status });

      const result = await backfillCategorizationAction();

      expect(result.summary).toBeUndefined();
      expect(result.error).toMatch(HEBREW);
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("gives each refusal its own message", async () => {
    const messages = new Set<string | undefined>();
    for (const status of ["provider_off", "sync_running", "incomplete"] as const) {
      backfill.mockResolvedValue({ status });
      messages.add((await backfillCategorizationAction()).error);
    }
    expect(messages.size).toBe(3);
  });

  it("returns a generic Hebrew error, not the cause, when the backfill throws", async () => {
    backfill.mockRejectedValue(new Error("synthetic-store-failure"));

    const result = await backfillCategorizationAction();

    expect(result.error).toMatch(HEBREW);
    expect(result.error).not.toContain("synthetic-store-failure");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
