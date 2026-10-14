"use server";

import { revalidatePath } from "next/cache";
import type { AiSummary, BackfillOutcome } from "@/lib/sync";

const REFUSALS: Record<Exclude<BackfillOutcome["status"], "completed">, string> = {
  provider_off: "לא הוגדר ספק AI לקטלוג. ניתן לבחור ספק במסך ההגדרות.",
  sync_running: "סנכרון או קטלוג אחר כבר פועלים. נסה שוב בסיומם.",
  incomplete: "הקטלוג לא הושלם. בדוק את הגדרות ספק ה-AI ונסה שוב.",
};

/**
 * Categorizes every still-uncategorized transaction with the configured
 * provider (#263) and reports the run's summary. Awaits the whole run, which
 * pacing makes slow for a large history.
 */
export async function backfillCategorizationAction(): Promise<{
  summary?: AiSummary;
  error?: string;
}> {
  let outcome: BackfillOutcome;
  try {
    // Lazy, as in the scheduler: the sync module carries the scraper, which
    // this page's server graph otherwise never loads.
    const { backfillCategorization } = await import("@/lib/sync");
    outcome = await backfillCategorization();
  } catch {
    return { error: "שגיאה בקטלוג העסקאות" };
  }

  if (outcome.status !== "completed") return { error: REFUSALS[outcome.status] };

  revalidatePath("/transactions");
  revalidatePath("/");
  return { summary: outcome.summary };
}
