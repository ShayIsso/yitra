"use client";

import { StepFooter } from "../step-footer";
import { StepPlaceholder } from "../step-placeholder";
import type { SetupStepProps } from "../step-navigation";

/**
 * Slot owned by #261: picks the categorization provider, defaulting to `off`
 * (ADR-0014 §3). Change only this file's body; the export name and props are
 * fixed by the frame. Writes go through a guarded Server Action (see
 * `../step-navigation.ts`).
 */
export function ProviderStep({ navigation }: SetupStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <StepPlaceholder />
      <StepFooter navigation={navigation} />
    </div>
  );
}
