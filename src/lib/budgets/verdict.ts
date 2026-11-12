/**
 * A budget's pace verdict (CONTEXT.md "budget pace"). Dependency-free on
 * purpose: client components read it, and the budgets index pulls the DB.
 */
export type BudgetVerdict = "over" | "at-risk" | "on-pace" | "comfortably-under";

/** The verdicts that call for attention: coral in the UI (ADR-0015), never "good". */
export function verdictNeedsAttention(verdict: BudgetVerdict): boolean {
  return verdict === "over" || verdict === "at-risk";
}
