import { describe, it, expect } from "vitest";
import { VERDICT_LABEL } from "@/components/budget-verdict";
import type { BudgetVerdict } from "@/lib/budgets";

const ALL_VERDICTS: BudgetVerdict[] = ["over", "at-risk", "on-pace", "comfortably-under"];

describe("VERDICT_LABEL", () => {
  it("names every pace verdict the budgets module can return", () => {
    for (const verdict of ALL_VERDICTS) expect(VERDICT_LABEL[verdict]).toBeTruthy();
  });
});
