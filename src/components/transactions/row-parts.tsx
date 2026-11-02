"use client";

import * as React from "react";
import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  ClockIcon,
  LinkSimpleIcon,
  RepeatIcon,
  RobotIcon,
  SparkleIcon,
  XIcon,
} from "@/components/icons";
import { Amount } from "@/components/ui/amount";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  CategoryDot,
  GroupedCategorySelectItems,
} from "@/components/grouped-category-select-items";
import type { Category, CategoryTreeNode } from "@/lib/categories";
import { cn } from "@/lib/utils";
import type { Transaction } from "./types";

export function displayName(tx: Transaction): string {
  return tx.customDescription ?? tx.description;
}

export const CADENCE_LABELS: Record<
  NonNullable<Transaction["recurringExpense"]>["cadence"],
  string
> = {
  monthly: "חודשי",
  quarterly: "רבעוני",
  annual: "שנתי",
};

export function recurringLabel(re: NonNullable<Transaction["recurringExpense"]>): string {
  return `הוצאה חוזרת: ${re.merchant} (${CADENCE_LABELS[re.cadence]})`;
}

/** Transfers and ignored rows are outside every total (CONTEXT.md), so their amount recedes. */
function isOutsideTotals(category: Category | undefined): boolean {
  return category?.type === "transfer" || category?.type === "ignore";
}

/**
 * The charged amount, with the purchase's original amount beneath it only when
 * it was in another currency. Money in is the only coloured figure; money out
 * keeps its minus sign in ink, so colour is never the only signal.
 */
export function TransactionAmount({
  tx,
  category,
  className,
}: {
  tx: Transaction;
  category: Category | undefined;
  className?: string;
}) {
  const muted = isOutsideTotals(category);
  return (
    <span className={cn("flex flex-col items-end text-end", className)}>
      <Amount
        amount={tx.chargedAmount}
        currency={tx.chargedCurrency ?? "ILS"}
        colorize={!muted && tx.chargedAmount > 0}
        className={cn("font-semibold whitespace-nowrap", muted && "text-muted-foreground")}
      />
      {tx.originalCharge && (
        <span className="text-caption text-muted-foreground whitespace-nowrap">
          <span className="sr-only">סכום מקורי </span>
          <Amount
            amount={tx.originalCharge.amount}
            currency={tx.originalCharge.currency}
            colorize={false}
          />
        </span>
      )}
    </span>
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

export function PendingMark() {
  return (
    <span className="text-muted-foreground inline-flex shrink-0 items-center gap-0.5 font-medium">
      <ClockIcon weight="fill" className="size-3" />
      ממתין
    </span>
  );
}

/** Small status marks shared by the feed and the table, after the row's name. */
export function RowMarks({ tx, showSuggestion }: { tx: Transaction; showSuggestion: boolean }) {
  return (
    <>
      {tx.status === "pending" && <PendingMark />}
      {tx.type === "installments" &&
        tx.installmentNumber != null &&
        tx.installmentTotal != null && (
          <span className="shrink-0 tabular-nums">
            <span className="sr-only">תשלום </span>
            {tx.installmentNumber}/{tx.installmentTotal}
          </span>
        )}
      {tx.recurringExpense && (
        <span title={recurringLabel(tx.recurringExpense)} className="inline-flex shrink-0">
          <RepeatIcon className="size-3.5" alt={recurringLabel(tx.recurringExpense)} />
        </span>
      )}
      {tx.reconciliationGroupId && (
        <span title="חלק מקבוצת התאמה" className="inline-flex shrink-0">
          <LinkSimpleIcon className="size-3.5" alt="חלק מקבוצת התאמה" />
        </span>
      )}
      {showSuggestion && tx.pendingSuggestion && (
        <span className="text-foreground inline-flex shrink-0 items-center gap-0.5 font-medium">
          <SparkleIcon weight="duotone" className="size-3.5" />
          הצעה
        </span>
      )}
    </>
  );
}

export function CategoryPicker({
  tx,
  tree,
  category,
  onAssign,
  triggerClassName,
  id,
}: {
  tx: Transaction;
  tree: CategoryTreeNode<Category>[];
  category: Category | undefined;
  onAssign: (id: string, categoryId: string) => void;
  triggerClassName?: string;
  id?: string;
}) {
  return (
    <Select
      value={tx.categoryId ?? "__none__"}
      onValueChange={(v) => {
        if (v && v !== "__none__") onAssign(tx.id, v);
      }}
    >
      <SelectTrigger id={id} aria-label="קטגוריה" className={triggerClassName}>
        <CategoryName category={category} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">
          <span className="text-muted-foreground">ללא קטגוריה</span>
        </SelectItem>
        <GroupedCategorySelectItems tree={tree} />
      </SelectContent>
    </Select>
  );
}

function useBusy() {
  const [busy, setBusy] = React.useState(false);
  const run = React.useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }, []);
  return [busy, run] as const;
}

const ICON_BUTTON =
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-7 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-3 disabled:opacity-50";

/**
 * A pending AI suggestion (#149): accept writes the same user-tier memory as a
 * manual pick (ADR-0010); reject only suppresses the suggestion.
 */
export function SuggestionChip({
  suggestion,
  onAccept,
  onReject,
}: {
  suggestion: NonNullable<Transaction["pendingSuggestion"]>;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const [busy, run] = useBusy();
  return (
    <div className="bg-muted flex max-w-full items-center gap-1 rounded-lg ps-2 text-xs">
      <SparkleIcon weight="duotone" className="size-3.5 shrink-0" />
      <span className="truncate">הצעה: {suggestion.categoryName}</span>
      <span
        title={`רמת ביטחון ${suggestion.confidence} מתוך 7`}
        className="text-muted-foreground shrink-0 tabular-nums"
      >
        ({suggestion.confidence}/7)
      </span>
      <button
        type="button"
        onClick={() => run(onAccept)}
        disabled={busy}
        title="אישור ההצעה"
        aria-label={`אישור ההצעה: ${suggestion.categoryName}`}
        className={ICON_BUTTON}
      >
        <CheckIcon className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => run(onReject)}
        disabled={busy}
        title="דחיית ההצעה"
        aria-label={`דחיית ההצעה: ${suggestion.categoryName}`}
        className={ICON_BUTTON}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}

/** An AI-assigned category's marker, with one-click undo back to uncategorized. */
export function AiMarker({ onUndo }: { onUndo: () => Promise<void> }) {
  const [busy, run] = useBusy();
  return (
    <span className="flex shrink-0 items-center">
      <span title="הקטגוריה שויכה אוטומטית על ידי AI" className="text-muted-foreground inline-flex">
        <RobotIcon className="size-3.5" alt="קוטלג על ידי AI" />
      </span>
      <button
        type="button"
        onClick={() => run(onUndo)}
        disabled={busy}
        title="ביטול שיוך ה-AI"
        aria-label="ביטול שיוך ה-AI"
        className={ICON_BUTTON}
      >
        <ArrowCounterClockwiseIcon className="size-3.5" />
      </button>
    </span>
  );
}
