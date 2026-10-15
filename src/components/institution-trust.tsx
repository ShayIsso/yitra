import type { ComponentProps } from "react";
import { Check, FlaskConical, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { bankLabel, type BankTrust } from "@/lib/bank-registry";

/**
 * The trust a screen shows beside an institution (ADR-0013 §3). Verified carries
 * no badge: it is the default an owner should not have to read about. Tier and
 * trust are presentational only — this module and the institution picker are
 * where they are read; scraping, import and categorization never see them.
 */
const TRUST_BADGE: Record<
  Exclude<BankTrust, "verified">,
  { text: string; title: string; icon: LucideIcon }
> = {
  experimental: { text: "ניסיוני", title: "מוסד שעדיין לא נבדק על ידינו", icon: FlaskConical },
  observed: {
    text: "סונכרן כאן",
    title: "מוסד ניסיוני שכבר סונכרן בהצלחה בהתקנה זו",
    icon: Check,
  },
};

export function InstitutionTrustBadge({
  trust,
  className,
  ...props
}: { trust: BankTrust | undefined } & Omit<ComponentProps<typeof Badge>, "children">) {
  if (trust === undefined || trust === "verified") return null;
  const { text, title, icon: Icon } = TRUST_BADGE[trust];
  return (
    <Badge
      variant="outline"
      title={title}
      data-trust={trust}
      className={cn("text-muted-foreground font-normal", className)}
      {...props}
    >
      <Icon data-icon="inline-start" />
      {text}
    </Badge>
  );
}

/**
 * Shown beside a sync failure of an institution this install has never synced
 * and we have never verified, so the failure reads as an unverified institution
 * rather than an app defect. Null for every other trust: a verified or observed
 * institution's failure message stays exactly as the sync reported it.
 */
export function unverifiedFailureNote(
  bankType: string,
  trust: BankTrust | undefined,
): string | null {
  if (trust !== "experimental") return null;
  return `${bankLabel(bankType)} הוא מוסד ניסיוני שעדיין לא נבדק על ידינו, ולכן ייתכן שהסנכרון שלו אינו נתמך במלואו.`;
}
