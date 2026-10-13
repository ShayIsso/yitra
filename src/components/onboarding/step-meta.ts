import type { SetupStep } from "@/lib/onboarding/steps";

export type StepMeta = {
  /** Short label for the progress indicator. */
  readonly label: string;
  readonly title: string;
  readonly description: string;
};

export const STEP_META: Record<SetupStep, StepMeta> = {
  password: {
    label: "סיסמה",
    title: "בחירת סיסמת כניסה",
    description:
      "הסיסמה מגינה על הגישה לאפליקציה. היא נשמרת במסד הנתונים שלכם כגיבוב (bcrypt) ולא כטקסט גלוי.",
  },
  categories: {
    label: "קטגוריות",
    title: "הקטגוריות שלכם",
    description: "יצרנו רשימת קטגוריות התחלתית לסיווג התנועות. אפשר לשנות אותה בכל עת בהגדרות.",
  },
  institution: {
    label: "חשבון",
    title: "חיבור בנק או כרטיס אשראי",
    description: "הוסיפו את פרטי ההתחברות לחשבון הראשון. הפרטים נשמרים מוצפנים במסד הנתונים שלכם.",
  },
  provider: {
    label: "סיווג",
    title: "סיווג אוטומטי של תנועות",
    description:
      "בחרו אם לסווג תנועות באופן אוטומטי. כברירת מחדל הסיווג כבוי, ושום מידע לא יוצא מהמחשב.",
  },
  "first-sync": {
    label: "סנכרון",
    title: "סנכרון ראשון",
    description: "נמשוך את התנועות מהחשבון שחיברתם ונציג את ההתקדמות בזמן אמת.",
  },
};
