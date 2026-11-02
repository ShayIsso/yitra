"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowsClockwiseIcon, WarningCircleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

/** The page's data read failed: a calm inline error whose retry re-runs the server render. */
export function SubscriptionsLoadError() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div
      role="alert"
      className="bg-card flex flex-col items-start gap-3 rounded-xl border border-[color:var(--card-border)] p-4 shadow-[var(--card-shadow)] sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-body flex items-center gap-2">
        <WarningCircleIcon weight="fill" className="text-attention-text size-5 shrink-0" />
        לא הצלחנו לטעון את החיובים הקבועים.
      </p>
      <Button
        variant="outline"
        className="h-11 gap-1.5 md:h-9"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        <ArrowsClockwiseIcon className="size-4" />
        {pending ? "טוען…" : "נסה שוב"}
      </Button>
    </div>
  );
}
