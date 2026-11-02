import { describe, it, expect } from "vitest";
import { originalCharge } from "../index";

describe("originalCharge", () => {
  it("is null when the original is in shekels written as the symbol and the charge is in ILS", () => {
    expect(
      originalCharge({
        originalAmount: -45.9,
        originalCurrency: "₪",
        chargedAmount: -45.9,
        chargedCurrency: "ILS",
      }),
    ).toBeNull();
  });

  it("is null when the original is ILS and the charge is written as the shekel symbol", () => {
    expect(
      originalCharge({
        originalAmount: -12,
        originalCurrency: "ILS",
        chargedAmount: -12,
        chargedCurrency: "₪",
      }),
    ).toBeNull();
  });

  it("is null when both sides use the shekel symbol", () => {
    expect(
      originalCharge({
        originalAmount: -80,
        originalCurrency: "₪",
        chargedAmount: -80,
        chargedCurrency: "₪",
      }),
    ).toBeNull();
  });

  it("treats a missing charged currency as shekels", () => {
    expect(
      originalCharge({
        originalAmount: -30,
        originalCurrency: "₪",
        chargedAmount: -30,
        chargedCurrency: null,
      }),
    ).toBeNull();
  });

  it("is null for a same-currency installment whose original is the full purchase price", () => {
    expect(
      originalCharge({
        originalAmount: -1200,
        originalCurrency: "ILS",
        chargedAmount: -100,
        chargedCurrency: "ILS",
      }),
    ).toBeNull();
  });

  it("returns the original amount and currency code for a dollar purchase charged in shekels", () => {
    expect(
      originalCharge({
        originalAmount: -19.99,
        originalCurrency: "$",
        chargedAmount: -73.4,
        chargedCurrency: "₪",
      }),
    ).toEqual({ amount: -19.99, currency: "USD" });
  });

  it("returns the original for a euro purchase whose charged currency is missing", () => {
    expect(
      originalCharge({
        originalAmount: -42,
        originalCurrency: "€",
        chargedAmount: -168.5,
        chargedCurrency: null,
      }),
    ).toEqual({ amount: -42, currency: "EUR" });
  });

  it("passes an ISO code it has no symbol for through unchanged", () => {
    expect(
      originalCharge({
        originalAmount: -500,
        originalCurrency: "TRY",
        chargedAmount: -55.2,
        chargedCurrency: "ILS",
      }),
    ).toEqual({ amount: -500, currency: "TRY" });
  });

  it("is null when a symbol and its ISO code name the same foreign currency", () => {
    expect(
      originalCharge({
        originalAmount: -10,
        originalCurrency: "$",
        chargedAmount: -10,
        chargedCurrency: "USD",
      }),
    ).toBeNull();
  });
});
