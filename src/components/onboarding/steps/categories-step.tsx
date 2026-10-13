"use client";

import { StepFooter } from "../step-footer";
import { StepPlaceholder } from "../step-placeholder";
import type { SetupStepProps, StepMeta } from "../step-navigation";

/** Slot owned by #259: the seeded taxonomy, shown read-only (epic #248 §10). Contract: `../step-navigation.ts`. */
export const categoriesStepMeta: StepMeta = {
  label: "קטגוריות",
  title: "הקטגוריות שלכם",
  description: "יצרנו רשימת קטגוריות התחלתית לסיווג התנועות. אפשר לשנות אותה בכל עת בהגדרות.",
};

export function CategoriesStep({ navigation }: SetupStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <StepPlaceholder />
      <StepFooter navigation={navigation} />
    </div>
  );
}
