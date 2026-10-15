import { describe, it, expect } from "vitest";
import { formatInvestment } from "@/components/reports-panel";

const digits = (s: string) => s.replace(/[^\d]/g, "");

describe("formatInvestment", () => {
  it("shows a net deposit as a plain amount", () => {
    const label = formatInvestment(1500);
    expect(digits(label)).toBe("1500");
    expect(label).not.toContain("משיכה");
    expect(label).not.toContain("-");
  });

  it("names a negative month a net withdrawal, never a deposit", () => {
    const label = formatInvestment(-3000);
    expect(digits(label)).toBe("3000");
    expect(label).toContain("-");
    expect(label).toContain("משיכה נטו");
  });
});
