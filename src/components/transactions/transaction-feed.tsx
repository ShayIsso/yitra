"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { CheckIcon } from "@/components/icons";
import type { Category } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { dayLabel, groupByDay } from "./days";
import { CategoryName, RowMarks, TransactionAmount, displayName } from "./row-parts";
import type { Transaction } from "./types";

/**
 * The phone layout: rows grouped under day headings. The amount column never
 * shrinks, so it stays on screen at any width while the name truncates. A row
 * tap opens the row's sheet, or toggles it while selecting.
 */
export function TransactionFeed({
  rows,
  categoryById,
  selecting,
  selected,
  onToggle,
  onOpen,
}: {
  rows: Transaction[];
  categoryById: ReadonlyMap<string, Category>;
  selecting: boolean;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const today = React.useMemo(() => new Date(), []);
  return (
    <div className="space-y-5">
      {groupByDay(rows).map((group) => {
        const headingId = `day-${group.day}`;
        return (
          <section key={group.day} aria-labelledby={headingId}>
            <h2
              id={headingId}
              className="text-caption text-muted-foreground mb-1.5 px-1 font-semibold"
            >
              {dayLabel(group.day, today)}
            </h2>
            <Card className="gap-0 py-0">
              <ul className="divide-border divide-y">
                {group.rows.map((tx) => {
                  const category = tx.categoryId ? categoryById.get(tx.categoryId) : undefined;
                  const isSelected = selected.has(tx.id);
                  return (
                    <li key={tx.id}>
                      <button
                        type="button"
                        onClick={() => (selecting ? onToggle(tx.id) : onOpen(tx.id))}
                        aria-pressed={selecting ? isSelected : undefined}
                        className={cn(
                          "hover:bg-muted focus-visible:ring-ring/50 flex min-h-16 w-full items-center gap-3 px-4 py-3 text-start outline-none focus-visible:ring-3 focus-visible:ring-inset",
                          isSelected && "bg-muted",
                        )}
                      >
                        {selecting && (
                          <span
                            aria-hidden
                            className={cn(
                              "border-input grid size-5 shrink-0 place-items-center rounded-full border",
                              isSelected && "border-primary bg-primary text-primary-foreground",
                            )}
                          >
                            {isSelected && <CheckIcon className="size-3.5" />}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="text-body block truncate font-medium">
                            {displayName(tx)}
                          </span>
                          <span className="text-caption text-muted-foreground mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden">
                            <CategoryName category={category} />
                            <RowMarks tx={tx} showSuggestion />
                          </span>
                        </span>
                        <TransactionAmount tx={tx} category={category} className="shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        );
      })}
    </div>
  );
}
