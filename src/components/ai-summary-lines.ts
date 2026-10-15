import type { AiSummary } from "@/lib/sync";

/** The AI step's summary as Hebrew lines, one per non-empty bucket — shared by the Sync page and the backfill callout. */
export function aiSummaryLines({ applied, queued, skipped }: AiSummary): string[] {
  const lines: string[] = [];
  if (applied > 0) lines.push(`${applied} עסקאות סווגו אוטומטית`);
  if (queued > 0) lines.push(`${queued} עסקאות ממתינות לבדיקה`);
  if (skipped > 0) lines.push(`${skipped} עסקאות נותרו ללא סיווג`);
  return lines;
}
