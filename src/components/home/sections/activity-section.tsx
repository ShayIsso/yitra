"use client";

import * as React from "react";
import { ArrowsLeftRightIcon } from "@/components/icons";
import { dayLabel, groupByDay } from "@/components/transactions/days";
import { Amount } from "@/components/ui/amount";
import type { RecentTransaction } from "@/lib/analytics";
import { transactionsHref } from "@/lib/transactions/view-params";
import { cn } from "@/lib/utils";
import type { SectionLoad } from "./load";
import { Bone, ListCard, ListSkeleton, ROW, Section, SectionBody, SectionEmpty } from "./parts";
import { localDate } from "./view";

/** How many of the latest rows the feed reads; the transactions page carries the rest. */
export const ACTIVITY_LIMIT = 8;

function ActivityRow({ tx }: { tx: RecentTransaction }) {
  // Transfers and ignored rows are outside every total (CONTEXT.md), so their amount recedes.
  const outside = tx.categoryType === "transfer" || tx.categoryType === "ignore";
  return (
    <li className={ROW}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body truncate font-medium">
          {tx.customDescription ?? tx.description}
        </span>
        <span className="text-caption text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5">
          {tx.categoryName ? (
            <>
              {tx.categoryColor && (
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: tx.categoryColor }}
                />
              )}
              <span className="truncate">{tx.categoryName}</span>
            </>
          ) : (
            <span className="truncate">ללא קטגוריה</span>
          )}
        </span>
      </span>
      {/* Money in is the only coloured figure; money out keeps its minus sign in ink. */}
      <Amount
        amount={tx.chargedAmount}
        currency={tx.chargedCurrency ?? "ILS"}
        colorize={!outside && tx.chargedAmount > 0}
        className={cn(
          "text-body shrink-0 font-semibold whitespace-nowrap",
          outside && "text-muted-foreground",
        )}
      />
    </li>
  );
}

function DayHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-caption text-muted-foreground mb-1.5 px-1 font-semibold">
      {children}
    </h3>
  );
}

/**
 * The latest rows, grouped under their calendar day; "today" and "yesterday"
 * are the home calendar day's (Asia/Jerusalem). The amount never shrinks, so
 * it stays on screen at any width while the name truncates.
 */
export function ActivitySection({ load }: { load: SectionLoad<RecentTransaction[]> }) {
  return (
    <Section title="פעילות אחרונה" link={{ label: "לכל התנועות", href: transactionsHref() }}>
      <SectionBody
        load={load}
        what="הפעילות האחרונה"
        skeleton={
          <div className="space-y-5">
            {[3, 2].map((rows, i) => (
              <div key={i}>
                <div className="text-caption mb-1.5 px-1">
                  <Bone className="w-20" />
                </div>
                <ListSkeleton rows={rows} />
              </div>
            ))}
          </div>
        }
      >
        {(rows, today) =>
          rows.length === 0 ? (
            <SectionEmpty
              icon={<ArrowsLeftRightIcon weight="duotone" className="size-6" />}
              heading="עוד אין תנועות"
              explainer="התנועות האחרונות מכל החשבונות יופיעו כאן, מקובצות לפי יום."
            />
          ) : (
            <div className="space-y-5">
              {groupByDay(rows).map((group) => {
                const headingId = `activity-${group.day}`;
                return (
                  <section key={group.day} aria-labelledby={headingId}>
                    <DayHeading id={headingId}>{dayLabel(group.day, localDate(today))}</DayHeading>
                    <ListCard>
                      {group.rows.map((tx) => (
                        <ActivityRow key={tx.id} tx={tx} />
                      ))}
                    </ListCard>
                  </section>
                );
              })}
            </div>
          )
        }
      </SectionBody>
    </Section>
  );
}
