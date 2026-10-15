import { describe, it, expect } from "vitest";
import { formatInvestment } from "@/components/reports-panel";
import { computeMonthlySummary } from "@/lib/analytics";

const digits = (s: string) => s.replace(/[^\d]/g, "");

describe("formatInvestment", () => {
  it("shows a net deposit as a plain amount", () => {
    const label = formatInvestment(1500);
    expect(digits(label)).toBe("1500");
    expect(label).not.toContain("משיכה");
    expect(label).not.toContain("-");
  });

  it("shows a month whose withdrawals cancel its deposits as a plain zero, never −0 or a withdrawal", () => {
    const { investmentTotal } = computeMonthlySummary([
      { chargedAmount: 0.1, categoryType: "investment" },
      { chargedAmount: 0.2, categoryType: "investment" },
      { chargedAmount: -0.3, categoryType: "investment" },
    ]);
    const label = formatInvestment(investmentTotal);
    expect(digits(label)).toBe("0");
    expect(label).not.toContain("-");
    expect(label).not.toContain("משיכה");
  });

  it("names a negative month a net withdrawal, never a deposit", () => {
    const label = formatInvestment(-3000);
    expect(digits(label)).toBe("3000");
    expect(label).toContain("-");
    expect(label).toContain("משיכה נטו");
  });
});
