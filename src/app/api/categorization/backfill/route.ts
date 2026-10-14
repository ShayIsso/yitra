export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { isSameOriginRequest } from "@/lib/api-utils";
import {
  backfillCategorization,
  type BackfillRefusal,
  type BackfillResult,
  type BackfillStart,
  type BackfillStreamEvent,
} from "@/lib/sync";

const REFUSALS: Record<BackfillRefusal["status"], string> = {
  provider_off: "לא הוגדר ספק AI לסיווג. ניתן לבחור ספק במסך ההגדרות.",
  sync_running: "סנכרון או סיווג אחר כבר פועלים. נסה שוב בסיומם.",
};
const INCOMPLETE = "הסיווג לא הושלם. בדוק את הגדרות ספק ה-AI ונסה שוב.";

// Well under the idle timeouts of browsers and common reverse proxies, so a
// long paced run is never cut off for silence.
const HEARTBEAT_MS = 15_000;

/**
 * Runs the categorization backfill (#263), which takes minutes on a large
 * history under pacing. A route rather than a Server Action: the client
 * dispatches Server Actions one at a time, so a run this long would stall every
 * inline edit on the transactions table behind it.
 *
 * A refusal known up front (provider off, claim held) is a plain 409. A started
 * run answers at once with an SSE stream — `started`, heartbeats, then one
 * `completed` or `incomplete` event — so nothing in between ever sees a silent
 * response. The run is not tied to the stream: a client that disconnects stops
 * only the stream, and the run still finishes, refreshes, and frees the claim.
 */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req.headers)) {
    return NextResponse.json({ error: "הבקשה נדחתה" }, { status: 403 });
  }

  let start: BackfillStart;
  try {
    start = await backfillCategorization();
  } catch {
    return NextResponse.json({ error: "שגיאה בסיווג העסקאות" }, { status: 500 });
  }
  if (start.status !== "started") {
    return NextResponse.json({ error: REFUSALS[start.status] }, { status: 409 });
  }

  const finalEvent = start.result.then(refreshAfter);
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: BackfillStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // The client disconnected; the run carries on without it.
        }
      };
      send({ type: "started" });
      heartbeat = setInterval(() => send({ type: "heartbeat" }), HEARTBEAT_MS);
      try {
        send(await finalEvent);
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed by cancel() below.
        }
      }
    },
    cancel() {
      clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // Stops nginx-style proxies from buffering the stream, heartbeats included.
      "X-Accel-Buffering": "no",
    },
  });
}

function refreshAfter(result: BackfillResult): BackfillStreamEvent {
  if (result.status !== "completed") return { type: "incomplete", error: INCOMPLETE };
  try {
    revalidatePath("/transactions");
    revalidatePath("/");
  } catch {
    // A refresh that cannot run (the request is long gone) loses nothing:
    // the transactions table refetches its own rows after a run.
  }
  return { type: "completed", summary: result.summary };
}
