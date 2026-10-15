import { describe, it, expect } from "vitest";
import { readBackfillResponse } from "@/components/backfill-response";

const HEBREW = /[֐-׿]/;
const SUMMARY = { applied: 2, queued: 1, skipped: 4 };

function frame(event: unknown) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function streamed(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("readBackfillResponse", () => {
  it("returns the summary from a completed stream, skipping heartbeats", async () => {
    const res = streamed([
      frame({ type: "started" }),
      frame({ type: "heartbeat" }),
      frame({ type: "completed", summary: SUMMARY }),
    ]);

    expect(await readBackfillResponse(res)).toEqual({ summary: SUMMARY });
  });

  it("reassembles a final event split across chunks", async () => {
    const final = frame({ type: "completed", summary: SUMMARY });
    const res = streamed([frame({ type: "started" }), final.slice(0, 9), final.slice(9)]);

    expect(await readBackfillResponse(res)).toEqual({ summary: SUMMARY });
  });

  it("returns the Hebrew message of an incomplete stream", async () => {
    const res = streamed([frame({ type: "incomplete", error: "הסיווג לא הושלם." })]);

    expect(await readBackfillResponse(res)).toEqual({ error: "הסיווג לא הושלם." });
  });

  it("reports a Hebrew disconnect when the stream ends without a final event", async () => {
    const result = await readBackfillResponse(streamed([frame({ type: "started" })]));

    expect(result.summary).toBeUndefined();
    expect(result.error).toMatch(HEBREW);
  });

  it("passes through a Hebrew refusal", async () => {
    expect(await readBackfillResponse(json(409, { error: "כבר פועלים." }))).toEqual({
      error: "כבר פועלים.",
    });
  });

  it.each([
    ["an English error", json(401, { error: "Unauthorized" })],
    ["a body with no error", json(500, {})],
    ["a non-JSON body", new Response("<html></html>", { status: 502 })],
  ])("replaces %s with a Hebrew message", async (_label, res) => {
    const result = await readBackfillResponse(res);

    expect(result.error).toMatch(HEBREW);
    expect(result.error).not.toContain("Unauthorized");
  });
});
