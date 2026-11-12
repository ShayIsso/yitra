import { describe, it, expect } from "vitest";
import { VERDICT_LABEL, VERDICT_CHIP_CLASS } from "@/components/budget-status-card";
import type { BudgetVerdict } from "@/lib/budgets";

const ALL_VERDICTS: BudgetVerdict[] = ["over", "at-risk", "on-pace", "comfortably-under"];

describe("VERDICT_LABEL / VERDICT_CHIP_CLASS", () => {
  it("has a non-empty label and chip class for every pace verdict the module can return", () => {
    for (const verdict of ALL_VERDICTS) {
      expect(VERDICT_LABEL[verdict]).toBeTruthy();
      expect(VERDICT_CHIP_CLASS[verdict]).toBeTruthy();
    }
  });
});
