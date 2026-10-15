"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderForm } from "@/components/provider-form";
import type { ProviderSettingsView } from "@/lib/ai-categorization";
import { getProviderSettingsAction } from "@/app/setup/provider-actions";
import { StepFooter } from "../step-footer";
import type { SetupStepProps, StepMeta } from "../step-navigation";

/** Slot owned by #261: the categorization provider, defaulting to `off` (ADR-0014 §3). Contract: `../step-navigation.ts`. */
export const providerStepMeta: StepMeta = {
  label: "סיווג",
  title: "סיווג אוטומטי של תנועות",
  description:
    "בחרו אם לסווג תנועות באופן אוטומטי. כברירת מחדל הסיווג כבוי, ושום מידע לא יוצא מהמחשב.",
};

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly settings: ProviderSettingsView };

/**
 * The same form Settings mounts, so a skipped step has a home to return to.
 * Skipping stores nothing, which resolves to `off` — zero egress.
 */
export function ProviderStep({ navigation }: SetupStepProps) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    getProviderSettingsAction().then(
      (settings) => active && setLoad({ kind: "ready", settings }),
      () => active && setLoad({ kind: "failed" }),
    );
    return () => {
      active = false;
    };
  }, []);

  if (load.kind !== "ready") {
    return (
      <div className="flex flex-col gap-6">
        {load.kind === "loading" ? (
          <div aria-busy="true" className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <p role="alert" className="text-destructive text-sm">
            לא הצלחנו לטעון את ההגדרה. אפשר לדלג ולבחור ספק מאוחר יותר בהגדרות.
          </p>
        )}
        <StepFooter navigation={navigation} primary={{ disabled: true }} />
      </div>
    );
  }

  return (
    <ProviderForm
      initial={load.settings}
      onSaved={() => navigation.advance()}
      actions={({ pending, pinned }) => (
        <StepFooter
          navigation={navigation}
          primary={{ label: pinned ? "המשך" : "שמירה והמשך", type: "submit", pending }}
        />
      )}
    />
  );
}
