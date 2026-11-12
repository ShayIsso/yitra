import { describe, it, expect } from "vitest";
import {
  formatInvestment,
  formatPercent,
  formatPointsDelta,
  formatSignedPercent,
  parseReportMonthParam,
  reportsMonthHref,
} from "@/components/reports/format";
import { computeMonthlySummary } from "@/lib/analytics";

const digits = (s: string) => s.replace(/[^\d]/g, "");
const LRM = "‎";

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

describe("signed figures in RTL", () => {
  it("anchors a change's sign to the left of its digits with a left-to-right mark", () => {
    expect(formatSignedPercent(12.4)).toBe(`${LRM}+12%`);
    expect(formatSignedPercent(-7.6)).toBe(`${LRM}-8%`);
  });

  it("prints no sign on a change that rounds to zero", () => {
    expect(formatSignedPercent(0.3)).toBe("0%");
    expect(formatSignedPercent(-0.3)).toBe("0%");
  });

  it("states savings-rate changes in points with the same anchored sign", () => {
    expect(formatPointsDelta(4.2)).toBe(`${LRM}+4 נק׳`);
    expect(formatPointsDelta(-11)).toBe(`${LRM}-11 נק׳`);
  });

  it("keeps a negative savings rate's minus anchored and a positive one unsigned", () => {
    expect(formatPercent(-15)).toBe(`${LRM}-15%`);
    expect(formatPercent(23)).toBe("23%");
  });
});

describe("reports month link", () => {
  it("links to one month's report", () => {
    expect(reportsMonthHref({ year: 2026, month: 3 })).toBe("/reports?month=2026-03");
  });

  it("reads the month a link names", () => {
    expect(parseReportMonthParam("2026-03")).toBe("2026-03");
  });

  it("reads nothing from an absent or malformed month, so the default month opens", () => {
    expect(parseReportMonthParam(null)).toBeNull();
    expect(parseReportMonthParam("2026-13")).toBeNull();
    expect(parseReportMonthParam("2026-00")).toBeNull();
    expect(parseReportMonthParam("2026-3")).toBeNull();
    expect(parseReportMonthParam("march")).toBeNull();
  });
});
