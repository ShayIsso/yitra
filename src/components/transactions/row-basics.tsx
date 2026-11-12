"use client";

import * as React from "react";
import { CategoryDot } from "@/components/category-dot";
import { Amount } from "@/components/ui/amount";
import type { Category } from "@/lib/categories";
import { cn } from "@/lib/utils";

/*
 * The parts of a transaction row that other surfaces (the home activity feed)
 * draw the same way. Kept apart from row-parts.tsx, whose category picker
 * pulls the Select primitive into any bundle that imports it.
 */

export function displayName(tx: { customDescription: string | null; description: string }): string {
  return tx.customDescription ?? tx.description;
}

/** Transfers and ignored rows are outside every total (CONTEXT.md), so their amount recedes. */
export function isOutsideTotals(category: Pick<Category, "type"> | undefined): boolean {
  return category?.type === "transfer" || category?.type === "ignore";
}

/**
 * A row's charged amount. Money in is the only coloured figure; money out
 * keeps its minus sign in ink, so colour is never the only signal.
 */
export function ChargedAmount({
  amount,
  currency,
  category,
  className,
}: {
  amount: number;
  currency: string | null;
  category: Pick<Category, "type"> | undefined;
  className?: string;
}) {
  const muted = isOutsideTotals(category);
  return (
    <Amount
      amount={amount}
      currency={currency ?? "ILS"}
      colorize={!muted && amount > 0}
      className={cn("font-semibold whitespace-nowrap", muted && "text-muted-foreground", className)}
    />
  );
}

export function CategoryName({ category }: { category: Category | undefined }) {
  return category ? (
    <span className="flex min-w-0 items-center gap-1.5">
      <CategoryDot color={category.color} />
      <span className="truncate">{category.name}</span>
    </span>
  ) : (
    <span className="text-muted-foreground truncate">ללא קטגוריה</span>
  );
}
