"use client";

import { ArrowsClockwiseIcon, WarningCircleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

/**
 * A route's `error.tsx` body: the page heading stays, and only the section
 * that failed to load says so, calmly, with a retry. The error itself is never
 * shown: a server error's message is redacted in production anyway, and this
 * app's errors can carry bank data.
 */
export function RouteLoadError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-headline font-bold">{title}</h1>
      <div
        role="alert"
        className="bg-card border-attention text-body flex flex-col items-start gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"
      >
        <span className="flex min-w-0 flex-1 items-start gap-3">
          <WarningCircleIcon weight="fill" className="text-attention-text mt-0.5 size-5 shrink-0" />
          <span className="flex flex-col gap-1">
            <span className="font-medium">{message}</span>
            <span className="text-muted-foreground">ייתכן שזו תקלה זמנית. אפשר לנסות שוב.</span>
          </span>
        </span>
        <Button variant="outline" className="h-11 px-4 md:h-9" onClick={onRetry}>
          <ArrowsClockwiseIcon />
          נסה שוב
        </Button>
      </div>
    </div>
  );
}
