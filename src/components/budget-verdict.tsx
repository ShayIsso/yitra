/**
 * A budget's pace verdict and the savings target's month verdict as words
 * with a glyph (CONTEXT.md "budget pace"), shared by the home budgets section
 * and the reports' month-close section. Every verdict is computed by the
 * budgets module; nothing here decides one. Coral marks only the verdicts
 * that call for attention (ADR-0015); the glyph and the words carry the
 * verdict, never the colour alone.
 */

import { CheckCircleIcon, WarningCircleIcon } from "@/components/icons";
import { CategoryDot } from "@/components/category-dot";
import { Amount } from "@/components/ui/amount";
import type { BudgetVerdict, SavingsTargetVerdict } from "@/lib/budgets";
import { cn } from "@/lib/utils";

export const VERDICT_LABEL: Record<BudgetVerdict, string> = {
  over: "חריגה",
  "at-risk": "בסיכון",
  "on-pace": "בקצב",
  "comfortably-under": "מתחת ליעד בנוחות",
};

export function verdictNeedsAttention(verdict: BudgetVerdict): boolean {
  return verdict === "over" || verdict === "at-risk";
}

export function BudgetVerdictChip({ verdict }: { verdict: BudgetVerdict }) {
  const attention = verdictNeedsAttention(verdict);
  return (
    <span
      className={cn(
        "text-caption inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
        attention ? "bg-attention-subtle text-attention-text" : "bg-muted text-muted-foreground",
      )}
    >
      {attention ? (
        <WarningCircleIcon weight="fill" className="size-3.5" />
      ) : (
        <CheckCircleIcon weight="fill" className="size-3.5" />
      )}
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

export function SavingsVerdict({ verdict }: { verdict: SavingsTargetVerdict }) {
  return verdict === "met" ? (
    <span className="text-caption text-muted-foreground inline-flex items-center gap-1 font-medium">
      <CheckCircleIcon weight="fill" className="text-primary size-3.5" />
      הושג
    </span>
  ) : (
    <span className="text-caption text-attention-text inline-flex items-center gap-1 font-medium">
      <WarningCircleIcon weight="fill" className="size-3.5" />
      לא הושג
    </span>
  );
}

export type BudgetRowData = {
  id: string;
  categoryName: string;
  categoryColor: string;
  verdict: BudgetVerdict;
  spent: number;
  limit: number;
};

/** Category dot, spent of limit and the verdict for one budget (the month-close section, #169). */
export function BudgetRow({ budget }: { budget: BudgetRowData }) {
  return (
    <div className="text-body flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex min-w-0 items-center gap-2">
        <CategoryDot color={budget.categoryColor} />
        <span className="truncate">{budget.categoryName}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-muted-foreground text-caption">
          <Amount amount={budget.spent} colorize={false} fractionDigits={0} /> מתוך{" "}
          <Amount amount={budget.limit} colorize={false} fractionDigits={0} />
        </span>
        <BudgetVerdictChip verdict={budget.verdict} />
      </div>
    </div>
  );
}
