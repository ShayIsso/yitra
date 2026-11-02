"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

/**
 * Money fields for react-hook-form. Rest props pass through, so the `id` and
 * `aria-*` that `FormControl` injects reach the input and its label points at it.
 */
type InputProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type">;

const AMOUNT_INPUT = {
  type: "number",
  inputMode: "decimal",
  step: "0.01",
  min: 0,
  dir: "ltr",
  className: "text-end tabular-nums",
} as const;

/** Empty reads as `NaN`, which the schema rejects as "required". */
export function AmountInput({
  value,
  onChange,
  ...props
}: InputProps & { value: number; onChange: (value: number) => void }) {
  return (
    <Input
      {...AMOUNT_INPUT}
      value={Number.isNaN(value) ? "" : value}
      onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
      {...props}
    />
  );
}

/** Empty reads as `null`: the way to clear an optional amount. */
export function OptionalAmountInput({
  value,
  onChange,
  ...props
}: InputProps & { value: number | null; onChange: (value: number | null) => void }) {
  return (
    <Input
      {...AMOUNT_INPUT}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      {...props}
    />
  );
}
