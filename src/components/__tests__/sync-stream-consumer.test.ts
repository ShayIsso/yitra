import { describe, it, expect, vi } from "vitest";
import {
  consumeSyncStream,
  singleFlight,
  type ClientSyncEvent,
  type SyncStreamAction,
} from "@/components/sync-stream";

const BANK = "synthetic-bank";

const frame = (event: ClientSyncEvent) => `data: ${JSON.stringify(event)}\n\n`;
const complete = frame({ type: "sync_complete", summary: { total: 1, byBank: { [BANK]: 1 } } });

function streamOf(chunks: (string | Uint8Array)[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

async function consume(
  response: Response | (() => Promise<Response>),
  controller?: AbortController,
) {
  const actions: SyncStreamAction[] = [];
  const onComplete = vi.fn();
  await consumeSyncStream({
    fetchImpl: typeof response === "function" ? response : async () => response,
    controller: controller ?? new AbortController(),
    dispatch: (action) => actions.push(action),
    onComplete,
  });
  return { actions, types: actions.map((a) => a.type), onComplete };
}

describe("consuming the sync stream", () => {
  it("announces the start before asking the server", async () => {
    let seenBeforeFetch: string[] = [];
    const actions: SyncStreamAction[] = [];
    await consumeSyncStream({
      fetchImpl: async () => {
        seenBeforeFetch = actions.map((a) => a.type);
        return streamOf([complete]);
      },
      controller: new AbortController(),
      dispatch: (action) => actions.push(action),
      onComplete: () => undefined,
    });
    expect(seenBeforeFetch).toEqual(["start_requested"]);
  });

  it("reports a 409 as a refusal with the server's message and never as an accepted run", async () => {
    const { actions, types } = await consume(
      new Response(JSON.stringify({ error: "סנכרון כבר פועל" }), { status: 409 }),
    );
    expect(types).toEqual(["start_requested", "refused"]);
    expect(actions[1]).toEqual({ type: "refused", message: "סנכרון כבר פועל" });
  });

  it("reports any other non-ok answer as a failed start", async () => {
    const { types } = await consume(new Response("nope", { status: 500 }));
    expect(types).toEqual(["start_requested", "start_failed"]);
  });

  it("delivers every event, in order, even when frames split across chunks", async () => {
    const progress = frame({ type: "progress", bank: BANK, status: "scraping" });
    const { actions, types } = await consume(
      streamOf([
        progress.slice(0, 7),
        progress.slice(7) + complete.slice(0, 20),
        complete.slice(20),
      ]),
    );
    expect(types).toEqual(["start_requested", "accepted", "event", "event"]);
    expect(actions[2]).toEqual({
      type: "event",
      event: { type: "progress", bank: BANK, status: "scraping" },
    });
  });

  it("decodes Hebrew text split mid-character across two chunks", async () => {
    const error = frame({ type: "bank_error", bank: BANK, error: "שגיאה", hasScreenshot: false });
    const bytes = new TextEncoder().encode(error);
    const hebrewStart = bytes.findIndex((b) => b >= 0x80);
    const { actions } = await consume(
      streamOf([bytes.slice(0, hebrewStart + 1), bytes.slice(hebrewStart + 1), complete]),
    );
    expect(actions[2]).toMatchObject({ event: { error: "שגיאה" } });
  });

  it("calls onComplete once, after sync_complete", async () => {
    const { onComplete, types } = await consume(streamOf([complete]));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(types.at(-1)).toBe("event");
  });

  it("treats a stream that ends without sync_complete as failed", async () => {
    const { types, onComplete } = await consume(
      streamOf([frame({ type: "progress", bank: BANK, status: "logging_in" })]),
    );
    expect(types.at(-1)).toBe("stream_failed");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("tears the connection down and fails on a malformed frame", async () => {
    const controller = new AbortController();
    const { types } = await consume(streamOf(["data: {not json\n\n"]), controller);
    expect(types).toEqual(["start_requested", "accepted", "stream_failed"]);
    expect(controller.signal.aborted).toBe(true);
  });

  it("reports nothing more when the consumer aborted on purpose", async () => {
    const controller = new AbortController();
    const { types } = await consume(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    }, controller);
    expect(types).toEqual(["start_requested"]);
  });
});

describe("a single-flight start", () => {
  it("ignores a second start while the first is still in flight, and allows one after", async () => {
    let release: () => void = () => undefined;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const start = singleFlight(run);

    const first = start();
    void start();
    expect(run).toHaveBeenCalledOnce();

    release();
    await first;
    void start();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("allows a new start after the previous one failed", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    const start = singleFlight(run);
    await start().catch(() => undefined);
    await start();
    expect(run).toHaveBeenCalledTimes(2);
  });
});
