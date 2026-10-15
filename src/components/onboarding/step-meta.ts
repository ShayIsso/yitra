import type { SetupStep } from "@/lib/onboarding/steps";
import type { StepMeta } from "./step-navigation";
import { categoriesStepMeta } from "./steps/categories-step";
import { firstSyncStepMeta } from "./steps/first-sync-step";
import { institutionStepMeta } from "./steps/institution-step";
import { providerStepMeta } from "./steps/provider-step";

const passwordStepMeta: StepMeta = {
  label: "סיסמה",
  title: "בחירת סיסמת כניסה",
  description:
    "הסיסמה מגינה על הגישה לאפליקציה. היא נשמרת במסד הנתונים שלכם כגיבוב (bcrypt) ולא כטקסט גלוי.",
};

/** Each later step's copy lives in its own slot file, so #259–#262 never share an edit. */
export const STEP_META: Record<SetupStep, StepMeta> = {
  password: passwordStepMeta,
  categories: categoriesStepMeta,
  institution: institutionStepMeta,
  provider: providerStepMeta,
  "first-sync": firstSyncStepMeta,
};
