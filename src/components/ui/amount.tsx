"use client";

/**
 * <Amount> — canonical currency display component.
 *
 * All currency formatting happens here (client-side only) to prevent
 * hydration mismatches (SSR locale ≠ browser locale for Intl.NumberFormat).
 *
 * Color convention (money-color source of truth — the --pos/--neg tokens,
 * the dedicated AA money pair of ADR-0015):
 *   - Non-negative values → text-pos
 *   - Negative values     → text-neg
 *   - No color            → inherit (use colorize={false})
 *
 * Typography (ADR-0015): digits are always tabular. `size` picks a step of
 * the type scale (default: inherit); `figure` sets the number in Rubik's
 * heavy cut with a smaller currency symbol, for headline numbers. The display
 * step is reserved for the one hero figure on a surface and is always a figure.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { canonicalCurrency } from "@/lib/transactions/currency";

/**
 * Normalises a currency string to an ISO 4217 code for Intl.NumberFormat.
 * Passes through strings that are already codes (e.g. "ILS", "USD").
 */
export function normalizeCurrency(currency: string): string {
  return canonicalCurrency(currency);
}

/**
 * Formats a numeric amount as a locale-aware Hebrew currency string.
 *
 * @param amount   - The numeric value to format.
 * @param currency - ISO 4217 code or a known symbol (₪, $, €, £). Defaults to "ILS".
 * @param fractionDigits - Override minimum/maximum fraction digits (default: 2 for foreign, 2 for ILS).
 */
export function formatAmount(
  amount: number,
  currency: string = "ILS",
  fractionDigits?: number,
): string {
  const code = normalizeCurrency(currency);
  const digits = fractionDigits ?? 2;
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: code,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

export type AmountPart = { type: "figure" | "currency"; value: string };

/**
 * formatAmount split into figure and currency runs, in display order, so the
 * symbol can be styled apart from the number. Joining the values gives the
 * formatAmount string exactly (bidi marks included).
 */
export function formatAmountParts(
  amount: number,
  currency: string = "ILS",
  fractionDigits?: number,
): AmountPart[] {
  const digits = fractionDigits ?? 2;
  const parts = new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: normalizeCurrency(currency),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).formatToParts(amount);
  const runs: AmountPart[] = [];
  for (const part of parts) {
    const type = part.type === "currency" ? "currency" : "figure";
    const last = runs[runs.length - 1];
    if (last?.type === type) last.value += part.value;
    else runs.push({ type, value: part.value });
  }
  return runs;
}

export type AmountSize = "caption" | "body" | "lead" | "title" | "headline" | "display";

// Spelled out in full, never built as `text-${size}`: Tailwind only emits
// utilities whose complete class name appears in the source.
const SIZE_CLASS: Record<AmountSize, string> = {
  caption: "text-caption",
  body: "text-body",
  lead: "text-lead",
  title: "text-title",
  headline: "text-headline",
  display: "text-display",
};

const FIGURE_CLASS = "font-extrabold tracking-tight";

/** The display step is reserved for the hero figure, so it is always a figure. */
function isFigure(size: AmountSize | undefined, figure: boolean): boolean {
  return figure || size === "display";
}

/** Type-scale and weight classes for an amount; empty means inherit. */
export function amountTypographyClass({
  size,
  figure = false,
}: {
  size?: AmountSize;
  figure?: boolean;
}): string {
  // text-display carries its own weight and tracking tokens.
  if (size === "display") return SIZE_CLASS.display;
  return cn(size && SIZE_CLASS[size], isFigure(size, figure) && FIGURE_CLASS);
}

/**
 * Maps a monetary value's sign to its money-color utility class.
 *
 * Pure and framework-free so the money-color law is node-testable without a DOM.
 * Zero is non-negative money, so it maps to `text-pos` (emerald is positive-only).
 *
 * @returns `"text-neg"` for negative, `"text-pos"` for non-negative, or
 *          `undefined` when colorize is false (inherit the surrounding text color).
 */
export function amountColorClass(amount: number, colorize: boolean): string | undefined {
  if (!colorize) return undefined;
  return amount < 0 ? "text-neg" : "text-pos";
}

export interface AmountProps {
  /** The numeric value to display. */
  amount: number;
  /**
   * ISO 4217 currency code or a known symbol (₪, $, €, £).
   * @default "ILS"
   */
  currency?: string;
  /**
   * Apply emerald (positive) / red (negative) color treatment.
   * Pass false to render in the inherited text color.
   * @default true
   */
  colorize?: boolean;
  /**
   * Override fraction digits (min and max are set to the same value).
   * Useful for ILS-only dashboard figures where 0 decimals are preferred.
   */
  fractionDigits?: number;
  /**
   * Type-scale step. Omit to inherit the surrounding text size.
   * `display` is reserved for the single hero figure on a surface.
   */
  size?: AmountSize;
  /** Heavy numerals with a de-emphasised currency symbol, for headline figures. */
  figure?: boolean;
  /** Additional class names applied to the wrapping <span>. */
  className?: string;
}

/**
 * Renders a currency amount with `tabular-nums` and locale-aware Hebrew
 * formatting. Use this component for ALL monetary values in the app.
 */
export function Amount({
  amount,
  currency = "ILS",
  colorize = true,
  fractionDigits,
  size,
  figure = false,
  className,
}: AmountProps) {
  const classes = cn(
    "tabular-nums",
    amountTypographyClass({ size, figure }),
    amountColorClass(amount, colorize),
    className,
  );

  if (!isFigure(size, figure)) {
    return <span className={classes}>{formatAmount(amount, currency, fractionDigits)}</span>;
  }
  return (
    <span className={classes}>
      {formatAmountParts(amount, currency, fractionDigits).map((part, i) =>
        part.type === "currency" ? (
          <span key={i} className="text-[0.55em] font-bold tracking-normal">
            {part.value}
          </span>
        ) : (
          part.value
        ),
      )}
    </span>
  );
}
