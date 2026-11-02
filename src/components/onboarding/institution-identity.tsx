import { BankIcon, CreditCardIcon } from "@/components/icons";
import { bankKindOf, bankLabel } from "@/lib/bank-registry";

/**
 * A connected institution as the wizard lists it: a glyph for its kind, the
 * owner's display name, and the registry label beneath (never a logo). Takes
 * the stored id as `string`, so a de-registered institution still renders the
 * registry's unknown-institution label (ADR-0013 §4).
 */
export function InstitutionIdentity({
  bankType,
  displayName,
  children,
}: {
  bankType: string;
  displayName: string;
  /** Rendered after the label, e.g. a trust badge. */
  children?: React.ReactNode;
}) {
  const Glyph = bankKindOf(bankType) === "bank" ? BankIcon : CreditCardIcon;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-full">
        <Glyph className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-body truncate font-medium">{displayName}</span>
        <span className="text-caption text-muted-foreground flex flex-wrap items-center gap-1.5">
          {bankLabel(bankType)}
          {children}
        </span>
      </span>
    </div>
  );
}
