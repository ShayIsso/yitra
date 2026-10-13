"use client";

import { StepFooter } from "../step-footer";
import { StepPlaceholder } from "../step-placeholder";
import type { SetupStepProps } from "../step-navigation";

/**
 * Slot owned by #259: shows the seeded taxonomy, read-only (epic #248 §10).
 * Change only this file's body; the export name and props are fixed by the
 * frame. Writes go through a guarded Server Action (see `../step-navigation.ts`).
 */
export function CategoriesStep({ navigation }: SetupStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <StepPlaceholder />
      <StepFooter navigation={navigation} />
    </div>
  );
}
