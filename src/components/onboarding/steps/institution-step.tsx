"use client";

import { StepFooter } from "../step-footer";
import { StepPlaceholder } from "../step-placeholder";
import type { SetupStepProps, StepMeta } from "../step-navigation";

/** Slot owned by #260: the first institution, through the registry-driven credential form (epic #248 §2, §10). Contract: `../step-navigation.ts`. */
export const institutionStepMeta: StepMeta = {
  label: "חשבון",
  title: "חיבור בנק או כרטיס אשראי",
  description: "הוסיפו את פרטי ההתחברות לחשבון הראשון. הפרטים נשמרים מוצפנים במסד הנתונים שלכם.",
};

export function InstitutionStep({ navigation }: SetupStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <StepPlaceholder />
      <StepFooter navigation={navigation} />
    </div>
  );
}
