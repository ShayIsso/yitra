"use client";

import { StepFooter } from "../step-footer";
import { StepPlaceholder } from "../step-placeholder";
import type { SetupStepProps, StepMeta } from "../step-navigation";

/** Slot owned by #262: the real first sync on the existing SSE stream (epic #248 §10); the last step, so `navigation.advance` completes onboarding. Contract: `../step-navigation.ts`. */
export const firstSyncStepMeta: StepMeta = {
  label: "סנכרון",
  title: "סנכרון ראשון",
  description: "נמשוך את התנועות מהחשבון שחיברתם ונציג את ההתקדמות בזמן אמת.",
};

export function FirstSyncStep({ navigation }: SetupStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <StepPlaceholder />
      <StepFooter navigation={navigation} />
    </div>
  );
}
