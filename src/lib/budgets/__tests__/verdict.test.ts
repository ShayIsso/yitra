import { describe, it, expect } from "vitest";
import { verdictNeedsAttention, type BudgetVerdict } from "@/lib/budgets/verdict";

const ALL_VERDICTS: BudgetVerdict[] = ["over", "at-risk", "on-pace", "comfortably-under"];

describe("verdictNeedsAttention", () => {
  it("calls for attention only when over or at risk", () => {
    expect(ALL_VERDICTS.filter(verdictNeedsAttention)).toEqual(["over", "at-risk"]);
  });
});
