"use client";

import * as React from "react";
import { BankIcon } from "@/components/icons";
import { Amount } from "@/components/ui/amount";
import type { AccountBalance } from "@/lib/analytics";
import { bankLabel } from "@/lib/bank-registry";
import { cn } from "@/lib/utils";
import type { SectionLoad } from "./load";
import { ListCard, ListSkeleton, ROW, Section, SectionBody, SectionEmpty } from "./parts";
import { balanceTone, debitDayHint } from "./view";

function Balance({ balance }: { balance: number | null }) {
  const tone = balanceTone(balance);
  if (tone === "unknown") {
    return (
      <span className="text-body text-muted-foreground shrink-0">
        <span aria-hidden="true">—</span>
        <span className="sr-only">אין יתרה</span>
      </span>
    );
  }
  return (
    <span className="flex shrink-0 flex-col items-end text-end">
      <Amount
        amount={balance!}
        colorize={false}
        fractionDigits={0}
        className={cn(
          "text-body font-semibold whitespace-nowrap",
          tone === "negative" && "text-neg",
        )}
      />
      {/* Red is never the only signal: the minus sign and this word carry it too. */}
      {tone === "negative" && <span className="text-caption text-neg font-medium">במינוס</span>}
    </span>
  );
}

/** Every stored account's latest balance: neutral when it isn't negative. */
export function AccountsSection({ load }: { load: SectionLoad<AccountBalance[]> }) {
  return (
    <Section title="חשבונות" link={{ label: "סנכרון", href: "/sync" }}>
      <SectionBody load={load} what="החשבונות" skeleton={<ListSkeleton rows={2} />}>
        {(accounts) =>
          accounts.length === 0 ? (
            <SectionEmpty
              icon={<BankIcon weight="duotone" className="size-6" />}
              heading="עוד אין חשבונות"
              explainer="היתרות יופיעו כאן אחרי שסנכרון יביא את החשבונות מהבנק או מחברת האשראי."
              action={{ label: "לסנכרון", href: "/sync" }}
            />
          ) : (
            <ListCard>
              {accounts.map((account) => (
                <li key={account.id} className={ROW}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body truncate font-medium">{account.displayName}</span>
                    <span className="text-caption text-muted-foreground mt-0.5 truncate">
                      {bankLabel(account.bankType)} ·{" "}
                      <span dir="ltr" className="tabular-nums">
                        ****{account.accountNumber.slice(-4)}
                      </span>
                      {account.nextDebitDate && account.balance !== 0 && (
                        <> · חיוב קרוב {debitDayHint(account.nextDebitDate)}</>
                      )}
                    </span>
                  </span>
                  <Balance balance={account.balance} />
                </li>
              ))}
            </ListCard>
          )
        }
      </SectionBody>
    </Section>
  );
}
