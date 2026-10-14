import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/sync", () => ({
  backfillCategorization: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { backfillCategorization } from "@/lib/sync";
import { POST } from "../route";

const backfill = vi.mocked(backfillCategorization);
const HEBREW = /[֐-׿]/;

async function post() {
  const res = await POST();
  return { status: res.status, body: (await res.json()) as { summary?: unknown; error?: string } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/categorization/backfill", () => {
  it("answers with the run's summary and refreshes the transaction pages", async () => {
    backfill.mockResolvedValue({
      status: "completed",
      summary: { applied: 3, queued: 2, skipped: 1 },
    });

    const { status, body } = await post();

    expect(status).toBe(200);
    expect(body).toEqual({ summary: { applied: 3, queued: 2, skipped: 1 } });
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it.each([
    ["provider_off", 409],
    ["sync_running", 409],
    ["incomplete", 502],
  ] as const)(
    "refuses a %s outcome with a Hebrew message and no refresh",
    async (outcome, code) => {
      backfill.mockResolvedValue({ status: outcome });

      const { status, body } = await post();

      expect(status).toBe(code);
      expect(body.summary).toBeUndefined();
      expect(body.error).toMatch(HEBREW);
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("gives each refusal its own message", async () => {
    const messages = new Set<string | undefined>();
    for (const outcome of ["provider_off", "sync_running", "incomplete"] as const) {
      backfill.mockResolvedValue({ status: outcome });
      messages.add((await post()).body.error);
    }
    expect(messages.size).toBe(3);
  });

  it("answers a generic Hebrew error, not the cause, when the backfill throws", async () => {
    backfill.mockRejectedValue(new Error("synthetic-store-failure"));

    const { status, body } = await post();

    expect(status).toBe(500);
    expect(body.error).toMatch(HEBREW);
    expect(JSON.stringify(body)).not.toContain("synthetic-store-failure");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
