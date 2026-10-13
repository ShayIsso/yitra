import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { bankLabel } from "@/lib/bank-registry";

/**
 * An institution's identity as every screen renders it: its registry label in a
 * badge, never a logo. Takes the stored id as `string` because a row naming a
 * de-registered institution stays readable (ADR-0013 §4) and must render the
 * registry's unknown-institution label rather than its raw id.
 */
export function BankBadge({
  bankType,
  variant = "secondary",
  ...props
}: { bankType: string } & Omit<ComponentProps<typeof Badge>, "children">) {
  return (
    <Badge variant={variant} {...props}>
      {bankLabel(bankType)}
    </Badge>
  );
}
