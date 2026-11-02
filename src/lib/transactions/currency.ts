/**
 * Currency identity for stored transactions. The scraper library reports a
 * currency as an ISO 4217 code from some institutions and as a symbol from
 * others, and both spellings are stored verbatim (no backfill), so "₪" and
 * "ILS" name the same currency: every currency comparison goes through
 * `canonicalCurrency`. No DB import, so client components may import it.
 */
const SYMBOL_TO_CODE: Readonly<Record<string, string>> = {
  "₪": "ILS",
  $: "USD",
  "€": "EUR",
  "£": "GBP",
};

/** A stored currency string as its ISO 4217 code; unknown strings pass through. */
export function canonicalCurrency(raw: string): string {
  return SYMBOL_TO_CODE[raw] ?? raw;
}

export type ChargeAmounts = {
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  /** Absent means shekels — the scraper omits it for local charges. */
  chargedCurrency: string | null;
};

/**
 * The purchase's original amount when it was made in a different currency
 * from the charge, else null. A same-currency difference (an installment's
 * full purchase price, a sign convention) is not a foreign original.
 */
export function originalCharge(row: ChargeAmounts): { amount: number; currency: string } | null {
  const original = canonicalCurrency(row.originalCurrency);
  if (original === canonicalCurrency(row.chargedCurrency ?? "ILS")) return null;
  return { amount: row.originalAmount, currency: original };
}
