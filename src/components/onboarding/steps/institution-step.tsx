"use client";

import { StepFooter } from "../step-footer";
import { StepPlaceholder } from "../step-placeholder";
import type { SetupStepProps } from "../step-navigation";

/**
 * Slot owned by #260: connects the first institution through the
 * registry-driven credential form (epic #248 §2, §10). Change only this file's
 * body; the export name and props are fixed by the frame. Writes go through a
 * guarded Server Action (see `../step-navigation.ts`) — never the Settings
 * credential actions, which are unguarded.
 */
export function InstitutionStep({ navigation }: SetupStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <StepPlaceholder />
      <StepFooter navigation={navigation} />
    </div>
  );
}
