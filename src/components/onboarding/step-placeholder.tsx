import { Construction } from "lucide-react";

/** Body for a step whose ticket has not landed yet; each slot replaces it. */
export function StepPlaceholder() {
  return (
    <div className="border-border text-muted-foreground flex items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-sm">
      <Construction className="size-5 shrink-0" />
      <p>השלב הזה עדיין בבנייה. אפשר לדלג עליו ולהשלים אותו מאוחר יותר בהגדרות.</p>
    </div>
  );
}
