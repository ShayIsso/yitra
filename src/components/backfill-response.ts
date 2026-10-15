import type { AiSummary, BackfillStreamEvent } from "@/lib/sync";
import { takeFrames } from "@/lib/sse-frames";

export type BackfillOutcomeView = { summary?: AiSummary; error?: string };

const GENERIC_ERROR = "שגיאה בסיווג העסקאות. נסה שוב.";
const DISCONNECTED =
  "החיבור לשרת נותק לפני סיום הסיווג. ייתכן שהוא ממשיך ברקע — רענן את הדף בעוד כמה דקות.";
const HEBREW = /[֐-׿]/;

/** Server messages are shown only when they are Hebrew; anything else (a middleware 401, say) is replaced. */
function hebrewOr(message: unknown, fallback: string): string {
  return typeof message === "string" && HEBREW.test(message) ? message : fallback;
}

/**
 * Reads the backfill route's answer: an SSE stream for a started run, or a
 * plain JSON error for a refusal. Never throws.
 */
export async function readBackfillResponse(res: Response): Promise<BackfillOutcomeView> {
  const isStream = res.ok && res.body && res.headers.get("content-type")?.includes("event-stream");
  if (!isStream) {
    const body: unknown = await res.json().catch(() => null);
    const message = body && typeof body === "object" && "error" in body ? body.error : undefined;
    return { error: hebrewOr(message, GENERIC_ERROR) };
  }

  try {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return { error: DISCONNECTED };
      buffer += decoder.decode(value, { stream: true });
      const { frames, rest } = takeFrames(buffer);
      buffer = rest;
      for (const frame of frames) {
        if (!frame.startsWith("data: ")) continue;
        const event = JSON.parse(frame.slice(6)) as BackfillStreamEvent;
        if (event.type === "completed") return { summary: event.summary };
        if (event.type === "incomplete") return { error: hebrewOr(event.error, GENERIC_ERROR) };
      }
    }
  } catch {
    return { error: DISCONNECTED };
  }
}

/** Starts a backfill and waits for its outcome. Never throws. */
export async function requestBackfill(): Promise<BackfillOutcomeView> {
  try {
    return await readBackfillResponse(
      await fetch("/api/categorization/backfill", { method: "POST" }),
    );
  } catch {
    return { error: "שגיאת חיבור. נסה שוב." };
  }
}
