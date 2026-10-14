"use client";

import * as React from "react";
import { Bot, Loader2, X } from "lucide-react";
import { backfillCategorizationAction } from "@/app/actions/categorization-backfill";
import type { AiSummary } from "@/lib/sync";
import { Button } from "@/components/ui/button";

type Result = { summary?: AiSummary; error?: string };

function summaryLines({ applied, queued, skipped }: AiSummary): string[] {
  const lines: string[] = [];
  if (applied > 0) lines.push(`${applied} עסקאות סווגו אוטומטית`);
  if (queued > 0) lines.push(`${queued} עסקאות ממתינות לבדיקה`);
  if (skipped > 0) lines.push(`${skipped} עסקאות נותרו ללא סיווג`);
  return lines.length > 0 ? lines : ["לא נמצאו עסקאות לסיווג"];
}

/**
 * The categorization backfill trigger (#263), shown on the uncategorized view
 * only while a provider is configured. Stays mounted through a run that
 * empties the view, so its result is still readable afterwards.
 */
export function CategorizationBackfillCallout({
  hasRows,
  onCompleted,
}: {
  hasRows: boolean;
  onCompleted: () => void;
}) {
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);

  async function run() {
    if (running) return;
    setRunning(true);
    setResult(null);
    const outcome: Result = await backfillCategorizationAction().catch(() => ({
      error: "שגיאה בקטלוג העסקאות",
    }));
    setRunning(false);
    setResult(outcome);
    if (outcome.summary) onCompleted();
  }

  if (!hasRows && !running && !result) return null;

  return (
    <div className="bg-muted/50 flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2.5">
        <Bot className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
        <div className="min-w-0 space-y-0.5" aria-live="polite">
          {result?.summary ? (
            <>
              <p className="font-medium">הסיווג החכם הושלם</p>
              {summaryLines(result.summary).map((line) => (
                <p key={line} className="text-muted-foreground">
                  {line}
                </p>
              ))}
            </>
          ) : running ? (
            <>
              <p className="font-medium">מסווג את העסקאות ללא קטגוריה...</p>
              <p className="text-muted-foreground">בהיסטוריה ארוכה זה עשוי להימשך כמה דקות.</p>
            </>
          ) : (
            <>
              <p className="font-medium">סיווג חכם לעסקאות ללא קטגוריה</p>
              <p className="text-muted-foreground">
                כל העסקאות ללא קטגוריה, גם אלו שמחוץ לסינון הנוכחי, יסווגו בעזרת ספק ה-AI שהוגדר.
                התאמות ודאיות יוחלו, והשאר יוצעו לבדיקה.
              </p>
              {result?.error && <p className="text-destructive">{result.error}</p>}
            </>
          )}
        </div>
      </div>
      {result?.summary ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setResult(null)}
          className="shrink-0 self-end sm:self-auto"
          aria-label="סגור"
        >
          <X className="size-4" strokeWidth={1.5} />
          סגור
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={run}
          disabled={running}
          className="shrink-0 self-end sm:self-auto"
        >
          {running && <Loader2 className="size-3.5 animate-spin" />}
          {running ? "מסווג..." : "סווג עם AI"}
        </Button>
      )}
    </div>
  );
}
