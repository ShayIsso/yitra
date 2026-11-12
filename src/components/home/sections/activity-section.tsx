"use client";

import * as React from "react";
import { ArrowsLeftRightIcon } from "@/components/icons";
import { dayLabel, groupByDay, toLocalDate } from "@/components/transactions/days";
import { CategoryName, ChargedAmount, displayName } from "@/components/transactions/row-basics";
import type { RecentTransaction } from "@/lib/analytics";
import type { Category } from "@/lib/categories";
import { transactionsHref } from "@/lib/transactions/view-params";
import type { SectionLoad } from "./load";
import { Bone, ListCard, ListSkeleton, ROW, Section, SectionBody, SectionEmpty } from "./parts";

/** How many of the latest rows the feed reads; the transactions page carries the rest. */
export const ACTIVITY_LIMIT = 8;

function ActivityRow({ tx, category }: { tx: RecentTransaction; category: Category | undefined }) {
  return (
    <li className={ROW}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body truncate font-medium">{displayName(tx)}</span>
        <span className="text-caption text-muted-foreground mt-0.5 flex min-w-0 items-center">
          <CategoryName category={category} />
        </span>
      </span>
      <ChargedAmount
        amount={tx.chargedAmount}
        currency={tx.chargedCurrency}
        category={category}
        className="text-body shrink-0"
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
 * it stays on screen at any width while the name truncates. Rows are drawn
 * the way the transactions feed draws them.
 */
export function ActivitySection({
  load,
  today,
  categoriesById,
}: {
  load: SectionLoad<RecentTransaction[]>;
  /** The home calendar day, live. */
  today: string;
  categoriesById: ReadonlyMap<string, Category>;
}) {
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
        {(rows) =>
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
                    <DayHeading id={headingId}>
                      {dayLabel(group.day, toLocalDate(today))}
                    </DayHeading>
                    <ListCard>
                      {group.rows.map((tx) => (
                        <ActivityRow
                          key={tx.id}
                          tx={tx}
                          category={tx.categoryId ? categoriesById.get(tx.categoryId) : undefined}
                        />
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
