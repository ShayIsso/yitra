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
import { GroupedCategorySelectItems } from "@/components/grouped-category-select-items";
import type { Category, CategoryTreeNode } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { CADENCE_LABELS } from "@/components/cadence-labels";
import { CategoryName, ChargedAmount } from "./row-basics";
import type { Transaction } from "./types";

function recurringLabel(re: NonNullable<Transaction["recurringExpense"]>): string {
  return `הוצאה חוזרת: ${re.merchant} (${CADENCE_LABELS[re.cadence]})`;
}

export const STATUS_LABELS: Record<string, string> = { completed: "הושלם", pending: "ממתין" };

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
  return (
    <span className={cn("flex flex-col items-end text-end", className)}>
      <ChargedAmount amount={tx.chargedAmount} currency={tx.chargedCurrency} category={category} />
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
  disabled,
}: {
  tx: Transaction;
  tree: CategoryTreeNode<Category>[];
  category: Category | undefined;
  onAssign: (id: string, categoryId: string) => void;
  triggerClassName?: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      disabled={disabled}
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

/** A pending flag around an async action, cleared even when the action throws. */
export function useBusy() {
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
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-8 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-3 disabled:opacity-50";

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
