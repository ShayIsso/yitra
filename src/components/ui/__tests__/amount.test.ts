import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Amount,
  amountColorClass,
  amountTypographyClass,
  formatAmount,
  formatAmountParts,
  normalizeCurrency,
} from "@/components/ui/amount";

describe("amountColorClass", () => {
  it("maps positive money to text-pos (emerald)", () => {
    expect(amountColorClass(1234.5, true)).toBe("text-pos");
  });

  it("maps negative money to text-neg (red)", () => {
    expect(amountColorClass(-1, true)).toBe("text-neg");
  });

  it("maps zero to text-pos (zero is non-negative money)", () => {
    expect(amountColorClass(0, true)).toBe("text-pos");
  });

  it("returns undefined when colorize is false regardless of sign", () => {
    expect(amountColorClass(-100, false)).toBeUndefined();
    expect(amountColorClass(100, false)).toBeUndefined();
    expect(amountColorClass(0, false)).toBeUndefined();
  });

  it("never colors a non-positive figure emerald", () => {
    for (const v of [-0.01, -50, -9999]) {
      expect(amountColorClass(v, true)).toBe("text-neg");
    }
  });
});

describe("normalizeCurrency", () => {
  it("maps known symbols to ISO 4217 codes", () => {
    expect(normalizeCurrency("₪")).toBe("ILS");
    expect(normalizeCurrency("$")).toBe("USD");
  });

  it("passes through strings that are already codes", () => {
    expect(normalizeCurrency("ILS")).toBe("ILS");
    expect(normalizeCurrency("USD")).toBe("USD");
  });
});

describe("formatAmount", () => {
  it("honors the fractionDigits override (no fractional part at 0 digits)", () => {
    // he-IL uses "," as the thousands separator, so assert specifically on the
    // decimal point: 0 digits → no ".dd" tail; 2 digits → a ".dd" tail present.
    expect(formatAmount(1000, "ILS", 0)).not.toMatch(/\.\d/);
    expect(formatAmount(1000, "ILS", 2)).toMatch(/\.\d\d/);
  });
});

describe("formatAmountParts", () => {
  it("reassembles to exactly the formatAmount string", () => {
    for (const [amount, currency, digits] of [
      [-12345, "ILS", 0],
      [12.5, "USD", undefined],
      [0, "₪", 2],
    ] as const) {
      const joined = formatAmountParts(amount, currency, digits)
        .map((p) => p.value)
        .join("");
      expect(joined).toBe(formatAmount(amount, currency, digits));
    }
  });

  it("isolates the currency symbol from the figure", () => {
    const parts = formatAmountParts(-12345, "ILS", 0);
    expect(parts.filter((p) => p.type === "currency").map((p) => p.value)).toEqual(["₪"]);
    const figure = parts
      .filter((p) => p.type === "figure")
      .map((p) => p.value)
      .join("");
    expect(figure).toContain("-12,345");
    expect(figure).not.toContain("₪");
  });
});

describe("amountTypographyClass", () => {
  it("inherits the surrounding size by default", () => {
    expect(amountTypographyClass({})).toBe("");
  });

  it("maps each type-scale step to its utility", () => {
    for (const size of ["caption", "body", "lead", "title", "headline"] as const) {
      expect(amountTypographyClass({ size })).toContain(`text-${size}`);
    }
  });

  it("sets figures in Rubik's heavy cut, tightly tracked", () => {
    expect(amountTypographyClass({ figure: true })).toMatch(/font-extrabold/);
    expect(amountTypographyClass({ figure: true })).toMatch(/tracking-tight/);
    expect(amountTypographyClass({ size: "body" })).not.toMatch(/font-extrabold/);
  });

  it("keeps the size step alongside the money colour", () => {
    const html = renderToStaticMarkup(createElement(Amount, { amount: -5, size: "title" }));
    expect(html).toContain("text-title");
    expect(html).toContain("text-neg");
  });

  it("always draws the display step as a figure", () => {
    expect(amountTypographyClass({ size: "display" })).toBe("text-display");
    const html = renderToStaticMarkup(
      createElement(Amount, { amount: 4200, fractionDigits: 0, size: "display" }),
    );
    expect(html).toMatch(/<span class="[^"]*">₪<\/span>/);
  });
});
