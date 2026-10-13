"use client";

import { StepFooter } from "../step-footer";
import { StepPlaceholder } from "../step-placeholder";
import type { SetupStepProps, StepMeta } from "../step-navigation";

/** Slot owned by #261: the categorization provider, defaulting to `off` (ADR-0014 §3). Contract: `../step-navigation.ts`. */
export const providerStepMeta: StepMeta = {
  label: "סיווג",
  title: "סיווג אוטומטי של תנועות",
  description:
    "בחרו אם לסווג תנועות באופן אוטומטי. כברירת מחדל הסיווג כבוי, ושום מידע לא יוצא מהמחשב.",
};

export function ProviderStep({ navigation }: SetupStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <StepPlaceholder />
      <StepFooter navigation={navigation} />
    </div>
  );
}
