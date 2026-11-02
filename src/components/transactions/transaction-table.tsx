"use client";

import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Category, CategoryTreeNode } from "@/lib/categories";
import {
  AiMarker,
  CategoryPicker,
  RowMarks,
  SuggestionChip,
  TransactionAmount,
  displayName,
} from "./row-parts";
import type { TransactionActions } from "./use-transaction-actions";
import type { Transaction } from "./types";
import { shortDay } from "./days";

/**
 * The desktop layout: a dense, fixed-layout table whose amounts sit in one
 * end-aligned tabular column. Category assignment stays inline for fast
 * triage; the name opens the row's sheet for everything else.
 */
export function TransactionTable({
  rows,
  categoryById,
  tree,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  actions,
}: {
  rows: Transaction[];
  categoryById: ReadonlyMap<string, Category>;
  tree: CategoryTreeNode<Category>[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
  actions: TransactionActions;
}) {
  const allSelected = rows.length > 0 && rows.every((t) => selected.has(t.id));
  const someSelected = !allSelected && rows.some((t) => selected.has(t.id));
  return (
    <Card className="gap-0 py-0">
      <Table className="table-fixed">
        <colgroup>
          <col className="w-11" />
          <col className="w-24" />
          <col />
          <col className="w-60" />
          <col className="w-36" />
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="ps-4">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={onToggleAll}
                aria-label="בחירת כל השורות בעמוד"
              />
            </TableHead>
            <TableHead className="text-muted-foreground text-caption">תאריך</TableHead>
            <TableHead className="text-muted-foreground text-caption">תיאור</TableHead>
            <TableHead className="text-muted-foreground text-caption">קטגוריה</TableHead>
            <TableHead className="text-muted-foreground text-caption pe-4 text-end">סכום</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((tx) => {
            const category = tx.categoryId ? categoryById.get(tx.categoryId) : undefined;
            const isSelected = selected.has(tx.id);
            return (
              <TableRow key={tx.id} data-state={isSelected ? "selected" : undefined}>
                <TableCell className="ps-4">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggle(tx.id)}
                    aria-label={`בחירת ${displayName(tx)}`}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {shortDay(tx.date)}
                </TableCell>
                <TableCell className="py-1.5">
                  <button
                    type="button"
                    onClick={() => onOpen(tx.id)}
                    className="group focus-visible:ring-ring/50 -mx-1 flex w-full min-w-0 flex-col items-start rounded-lg px-1 py-0.5 text-start outline-none focus-visible:ring-3"
                  >
                    <span className="w-full truncate font-medium group-hover:underline">
                      {displayName(tx)}
                    </span>
                    <span className="text-caption text-muted-foreground flex w-full min-w-0 items-center gap-2">
                      {tx.customDescription && <span className="truncate">{tx.description}</span>}
                      <RowMarks tx={tx} showSuggestion={false} />
                    </span>
                  </button>
                </TableCell>
                <TableCell className="py-1.5">
                  <div className="flex min-w-0 flex-col items-start gap-1">
                    <div className="flex w-full min-w-0 items-center gap-0.5">
                      <CategoryPicker
                        tx={tx}
                        tree={tree}
                        category={category}
                        onAssign={actions.assignCategory}
                        triggerClassName="hover:border-input hover:bg-background dark:hover:bg-input/30 h-8 min-w-0 flex-1 border-transparent bg-transparent px-1.5 shadow-none dark:bg-transparent"
                      />
                      {tx.categorySource === "ai" && (
                        <AiMarker onUndo={() => actions.undoAiAssignment(tx)} />
                      )}
                    </div>
                    {tx.pendingSuggestion && (
                      <SuggestionChip
                        suggestion={tx.pendingSuggestion}
                        onAccept={() => actions.acceptSuggestion(tx)}
                        onReject={() => actions.rejectSuggestion(tx)}
                      />
                    )}
                  </div>
                </TableCell>
                <TableCell className="pe-4">
                  <TransactionAmount tx={tx} category={category} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
