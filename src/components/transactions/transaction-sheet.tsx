"use client";

import * as React from "react";
import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  RobotIcon,
  SparkleIcon,
  XIcon,
} from "@/components/icons";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Category, CategoryTreeNode } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { longDay } from "./days";
import { CADENCE_LABELS } from "@/components/cadence-labels";
import { displayName, isOutsideTotals } from "./row-basics";
import { CategoryPicker, PendingMark, STATUS_LABELS, useBusy } from "./row-parts";
import type { TransactionActions } from "./use-transaction-actions";
import type { Transaction } from "./types";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-2">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="min-w-0 text-end">{children}</dd>
    </div>
  );
}

/**
 * A row's detail and edit sheet (a bottom sheet on phones, a dialog from md).
 * Category changes apply at once, like the table's inline picker; the custom
 * description is saved by the footer action.
 */
export function TransactionSheet({
  tx,
  categoryById,
  tree,
  actions,
  onClose,
}: {
  tx: Transaction | null;
  categoryById: ReadonlyMap<string, Category>;
  tree: CategoryTreeNode<Category>[];
  actions: TransactionActions;
  onClose: () => void;
}) {
  // Keep the last row rendered while the sheet animates out.
  const [shown, setShown] = React.useState(tx);
  if (tx && tx !== shown) setShown(tx);
  const row = tx ?? shown;
  return (
    <Dialog open={tx !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="md:max-w-md">
        {row && (
          <SheetBody
            key={row.id}
            tx={row}
            category={row.categoryId ? categoryById.get(row.categoryId) : undefined}
            tree={tree}
            actions={actions}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SheetBody({
  tx,
  category,
  tree,
  actions,
  onClose,
}: {
  tx: Transaction;
  category: Category | undefined;
  tree: CategoryTreeNode<Category>[];
  actions: TransactionActions;
  onClose: () => void;
}) {
  const [draft, setDraft] = React.useState(tx.customDescription ?? "");
  const [saving, runSave] = useBusy();
  const [busy, run] = useBusy();
  const next = draft.trim() === "" ? null : draft.trim();
  const changed = next !== tx.customDescription;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!changed) return onClose();
    return runSave(async () => {
      if (await actions.saveDescription(tx.id, next)) onClose();
    });
  }

  const suggestion = tx.pendingSuggestion;

  return (
    <form onSubmit={save} className="contents">
      <DialogHeader>
        <DialogTitle className="text-title leading-snug font-semibold">
          {displayName(tx)}
        </DialogTitle>
        <DialogDescription>
          {longDay(tx.date)}
          {tx.status === "pending" && (
            <>
              {" · "}
              <PendingMark />
            </>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        <div>
          <Amount
            amount={tx.chargedAmount}
            currency={tx.chargedCurrency ?? "ILS"}
            colorize={!isOutsideTotals(category) && tx.chargedAmount > 0}
            className={cn(isOutsideTotals(category) && "text-muted-foreground")}
            size="headline"
            figure
          />
          {tx.originalCharge && (
            <p className="text-body text-muted-foreground">
              סכום מקורי{" "}
              <Amount
                amount={tx.originalCharge.amount}
                currency={tx.originalCharge.currency}
                colorize={false}
              />
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="tx-category" className="text-body font-medium">
            קטגוריה
          </label>
          <div className="flex items-center gap-2">
            <CategoryPicker
              id="tx-category"
              tx={tx}
              tree={tree}
              category={category}
              onAssign={(id, categoryId) => run(() => actions.assignCategory(id, categoryId))}
              disabled={busy}
              triggerClassName="h-11 w-full min-w-0 flex-1"
            />
          </div>
          {tx.categorySource === "ai" && (
            <div className="text-body text-muted-foreground flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5">
                <RobotIcon className="size-4" />
                שויכה אוטומטית על ידי AI
              </span>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => run(() => actions.undoAiAssignment(tx))}
                className="h-11"
              >
                <ArrowCounterClockwiseIcon className="size-4" />
                ביטול השיוך
              </Button>
            </div>
          )}
          {suggestion && (
            <div className="bg-muted flex flex-wrap items-center gap-2 rounded-lg p-2 ps-3">
              <span className="text-body inline-flex min-w-0 flex-1 items-center gap-1.5">
                <SparkleIcon weight="duotone" className="size-4 shrink-0" />
                <span className="truncate">
                  הצעה: {suggestion.categoryName}{" "}
                  <span className="text-muted-foreground tabular-nums">
                    ({suggestion.confidence}/7)
                  </span>
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => run(() => actions.rejectSuggestion(tx))}
                className="h-11"
              >
                <XIcon className="size-4" />
                דחייה
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => run(() => actions.acceptSuggestion(tx))}
                className="h-11"
              >
                <CheckIcon className="size-4" />
                אישור
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="tx-custom-description" className="text-body font-medium">
            תיאור משלך
          </label>
          <Input
            id="tx-custom-description"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="שם שיוצג במקום התיאור מהבנק"
            aria-describedby="tx-bank-description"
            className="h-11"
          />
          <p id="tx-bank-description" className="text-caption text-muted-foreground">
            {tx.customDescription
              ? `התיאור מהבנק, שלא משתנה: ${tx.description}`
              : "התיאור מהבנק לא משתנה. השאירו ריק כדי להציג אותו."}
          </p>
        </div>

        <dl className="divide-border text-body divide-y">
          {tx.processedDate && tx.processedDate.slice(0, 10) !== tx.date.slice(0, 10) && (
            <Fact label="תאריך חיוב">{longDay(tx.processedDate)}</Fact>
          )}
          <Fact label="סטטוס">{STATUS_LABELS[tx.status]}</Fact>
          {tx.type === "installments" &&
            tx.installmentNumber != null &&
            tx.installmentTotal != null && (
              <Fact label="תשלומים">
                <span className="tabular-nums">
                  {tx.installmentNumber} מתוך {tx.installmentTotal}
                </span>
              </Fact>
            )}
          {tx.recurringExpense && (
            <Fact label="הוצאה חוזרת">
              {tx.recurringExpense.merchant} ({CADENCE_LABELS[tx.recurringExpense.cadence]})
            </Fact>
          )}
          {tx.reconciliationGroupId && (
            <Fact label="התאמה">
              <span className="inline-flex items-center gap-1">
                חלק מקבוצת התאמה
                {tx.reconciliationConfirmedAt && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => run(() => actions.undoReconciliation(tx.id))}
                    className="h-11"
                  >
                    <ArrowCounterClockwiseIcon className="size-4" />
                    ביטול ההתאמה
                  </Button>
                )}
              </span>
            </Fact>
          )}
        </dl>

        {actions.error && (
          <p role="alert" className="text-body text-attention-text">
            {actions.error}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          סגירה
        </Button>
        <Button type="submit" disabled={!changed || saving}>
          {saving ? "שומר..." : "שמירת התיאור"}
        </Button>
      </DialogFooter>
    </form>
  );
}
