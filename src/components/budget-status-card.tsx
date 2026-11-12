"use client";

/**
 * A budget's pace verdict as the budget rows render it (CONTEXT.md "budget
 * pace"; decision record #105): the verdict labels, the bordered-pill status
 * fills and the row itself, shared by the דוחות month-close section. All
 * verdicts are computed server-side by the budgets module; nothing here
 * decides one.
 *
 * Status vs. category-identity, by form not color (#166): category identity
 * is always a filled dot; a pace verdict is always a bordered pill, never a
 * dot, so the two can never be mistaken for each other.
 */

import * as React from "react";
import { Amount } from "@/components/ui/amount";
import type { BudgetVerdict, SavingsTargetVerdict } from "@/lib/budgets";

export type BudgetChipData = {
  id: string;
  categoryName: string;
  categoryColor: string;
  verdict: BudgetVerdict;
  spent: number;
  limit: number;
};

export const VERDICT_LABEL: Record<BudgetVerdict, string> = {
  over: "חריגה",
  "at-risk": "בסיכון",
  "on-pace": "בקצב",
  "comfortably-under": "מתחת ליעד בנוחות",
};

/**
 * The shared positive/negative chip fill — reused by both the per-verdict
 * palette below and the savings met/missed chip, so the two "good/bad" chip
 * treatments can't drift apart.
 */
const POSITIVE_CHIP_CLASS = "border-emerald/30 bg-emerald/10 text-emerald";
const NEGATIVE_CHIP_CLASS = "border-destructive/30 bg-destructive/10 text-destructive";

/** Low-saturation chip fills — the status palette. Never applied to a dot. */
export const VERDICT_CHIP_CLASS: Record<BudgetVerdict, string> = {
  over: NEGATIVE_CHIP_CLASS,
  // Amber as small text fails contrast at --warning's lightness (see
  // globals.css's warning token comment) — the wash carries the signal,
  // foreground carries the text.
  "at-risk": "border-warning/50 bg-warning/15 text-foreground",
  "on-pace": "border-muted text-muted-foreground",
  "comfortably-under": POSITIVE_CHIP_CLASS,
};

/**
 * The savings-target met/missed pill — same bordered-pill status system as
 * `VERDICT_CHIP_CLASS`, reused here and by the דוחות monthly report's
 * month-close section (issue #169) so the two can't drift on label or fill.
 */
export function SavingsVerdictChip({
  verdict,
  className = "",
}: {
  verdict: SavingsTargetVerdict;
  className?: string;
}) {
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[10px] ${
        verdict === "met" ? POSITIVE_CHIP_CLASS : NEGATIVE_CHIP_CLASS
      } ${className}`}
    >
      {verdict === "met" ? "הושג" : "לא הושג"}
    </span>
  );
}

/** Category dot + spent/limit + pace-verdict pill for one budget (the month-close section, #169). */
export function BudgetRow({ budget }: { budget: BudgetChipData }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: budget.categoryColor }}
        />
        <span className="truncate">{budget.categoryName}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-muted-foreground text-xs tabular-nums">
          <Amount amount={budget.spent} colorize={false} fractionDigits={0} /> /{" "}
          <Amount amount={budget.limit} colorize={false} fractionDigits={0} />
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${VERDICT_CHIP_CLASS[budget.verdict]}`}
        >
          {VERDICT_LABEL[budget.verdict]}
        </span>
      </div>
    </div>
  );
}
