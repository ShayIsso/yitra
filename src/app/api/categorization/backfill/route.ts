export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { backfillCategorization, type BackfillOutcome } from "@/lib/sync";

const REFUSALS: Record<Exclude<BackfillOutcome["status"], "completed">, string> = {
  provider_off: "לא הוגדר ספק AI לסיווג. ניתן לבחור ספק במסך ההגדרות.",
  sync_running: "סנכרון או סיווג אחר כבר פועלים. נסה שוב בסיומם.",
  incomplete: "הסיווג לא הושלם. בדוק את הגדרות ספק ה-AI ונסה שוב.",
};

/**
 * Runs the categorization backfill (#263) and answers with its summary once
 * the whole run is done — minutes, for a large history, under pacing.
 *
 * A route rather than a Server Action: the client dispatches Server Actions one
 * at a time, so a run this long would stall every inline edit on the
 * transactions table behind it.
 */
export async function POST() {
  let outcome: BackfillOutcome;
  try {
    outcome = await backfillCategorization();
  } catch {
    return NextResponse.json({ error: "שגיאה בסיווג העסקאות" }, { status: 500 });
  }

  if (outcome.status !== "completed") {
    return NextResponse.json(
      { error: REFUSALS[outcome.status] },
      { status: outcome.status === "incomplete" ? 502 : 409 },
    );
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  return NextResponse.json({ summary: outcome.summary });
}
