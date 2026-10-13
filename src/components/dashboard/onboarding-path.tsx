"use client";

import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
// Not the module's index: its DB-backed exports must not enter a client bundle.
import {
  deriveOnboardingPath,
  hasPendingOnboardingStep,
  type OnboardingPathFacts,
  type OnboardingPathStepId,
} from "@/lib/onboarding/path";

export type OnboardingPathProps = {
  /** Null while any fact is unknown (a fetch failed) — the nudge stays out rather than guess. */
  facts: OnboardingPathFacts | null;
};

const STEP_DEFS: Record<OnboardingPathStepId, { label: string; href: string }> = {
  connect: { label: "חבר מוסד פיננסי", href: "/settings" },
  "first-sync": { label: "הפעל סנכרון ראשון", href: "/sync" },
  review: { label: "סווג עסקאות שלא סווגו", href: "/transactions?uncategorized=true" },
};

export function OnboardingPath({ facts }: OnboardingPathProps) {
  if (facts === null) return null;
  const steps = deriveOnboardingPath(facts);
  if (!hasPendingOnboardingStep(steps)) return null;

  return (
    <section className="border-border rounded-lg border px-4 py-3" aria-label="השלמת ההגדרה">
      <p className="text-sm font-medium">להשלמת ההגדרה</p>
      <ol className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-x-6">
        {steps.map(({ id, status }) => {
          const { label, href } = STEP_DEFS[id];
          if (status === "done") {
            return (
              <li
                key={id}
                className="text-muted-foreground flex items-center gap-1.5 text-sm"
                aria-label={`${label}, הושלם`}
              >
                <CheckCircle2 className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                <span>{label}</span>
              </li>
            );
          }
          return (
            <li key={id} className="text-sm">
              <Link
                href={href}
                className="text-foreground press hover:bg-muted -mx-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium transition-colors"
              >
                <Circle
                  className="text-muted-foreground size-4 shrink-0"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
