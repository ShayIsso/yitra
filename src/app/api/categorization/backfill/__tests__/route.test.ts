import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/sync", () => ({
  backfillCategorization: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { backfillCategorization, type BackfillResult } from "@/lib/sync";
import { POST } from "../route";

const backfill = vi.mocked(backfillCategorization);
const HEBREW = /[֐-׿]/;
const SUMMARY = { applied: 3, queued: 2, skipped: 1 };

function request(headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) {
  return new NextRequest("http://localhost:3000/api/categorization/backfill", {
    method: "POST",
    headers,
  });
}

function deferred() {
  let resolve!: (result: BackfillResult) => void;
  const promise = new Promise<BackfillResult>((r) => (resolve = r));
  return { promise, resolve };
}

async function readEvents(res: Response): Promise<unknown[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((frame) => frame.startsWith("data: "))
    .map((frame) => JSON.parse(frame.slice(6)));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/categorization/backfill", () => {
  it("streams a started event, then the run's summary, and refreshes the transaction pages", async () => {
    backfill.mockResolvedValue({
      status: "started",
      result: Promise.resolve({ status: "completed", summary: SUMMARY }),
    });

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(await readEvents(res)).toEqual([
      { type: "started" },
      { type: "completed", summary: SUMMARY },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("streams a Hebrew incomplete event and refreshes nothing when the run yields no summary", async () => {
    backfill.mockResolvedValue({
      status: "started",
      result: Promise.resolve({ status: "incomplete" }),
    });

    const events = await readEvents(await POST(request()));

    expect(events[events.length - 1]).toEqual({ type: "incomplete", error: expect.any(String) });
    expect((events[events.length - 1] as { error: string }).error).toMatch(HEBREW);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sends headers before the run ends, with a heartbeat while it runs", async () => {
    vi.useFakeTimers();
    const run = deferred();
    backfill.mockResolvedValue({ status: "started", result: run.promise });

    const res = await POST(request());
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    expect(res.status).toBe(200);
    expect(decoder.decode((await reader.read()).value)).toContain('"started"');
    await vi.advanceTimersByTimeAsync(15_000);
    expect(decoder.decode((await reader.read()).value)).toContain('"heartbeat"');

    run.resolve({ status: "completed", summary: SUMMARY });
    expect(decoder.decode((await reader.read()).value)).toContain('"completed"');
    expect((await reader.read()).done).toBe(true);
  });

  it("lets the run finish and refresh after the client disconnects", async () => {
    const run = deferred();
    backfill.mockResolvedValue({ status: "started", result: run.promise });

    const res = await POST(request());
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();

    run.resolve({ status: "completed", summary: SUMMARY });
    await vi.waitFor(() => expect(revalidatePath).toHaveBeenCalledWith("/transactions"));
  });

  it.each(["provider_off", "sync_running"] as const)(
    "refuses a %s start with 409 and a Hebrew message, before any stream",
    async (status) => {
      backfill.mockResolvedValue({ status });

      const res = await POST(request());

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(HEBREW);
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("gives the two refusals different messages", async () => {
    backfill.mockResolvedValue({ status: "provider_off" });
    const off = ((await (await POST(request())).json()) as { error: string }).error;
    backfill.mockResolvedValue({ status: "sync_running" });
    const busy = ((await (await POST(request())).json()) as { error: string }).error;

    expect(off).not.toBe(busy);
  });

  it("answers a generic Hebrew 500, not the cause, when starting throws", async () => {
    backfill.mockRejectedValue(new Error("synthetic-store-failure"));

    const res = await POST(request());

    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toMatch(HEBREW);
    expect(text).not.toContain("synthetic-store-failure");
  });

  describe("cross-site refusal", () => {
    it.each([
      ["a cross-site fetch", { "sec-fetch-site": "cross-site" }],
      ["a foreign Origin without fetch metadata", { origin: "http://elsewhere.test" }],
      ["no fetch metadata and no Origin", {}],
    ])("refuses %s with 403 without starting a run", async (_label, headers) => {
      const res = await POST(request(headers));

      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: string }).error).toMatch(HEBREW);
      expect(backfill).not.toHaveBeenCalled();
    });

    it("accepts an Origin matching the Host when fetch metadata is absent", async () => {
      backfill.mockResolvedValue({ status: "provider_off" });

      const res = await POST(request({ origin: "http://localhost:3000", host: "localhost:3000" }));

      expect(res.status).toBe(409);
      expect(backfill).toHaveBeenCalled();
    });
  });
});
