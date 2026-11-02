"use client";

import * as React from "react";
import {
  CaretLeftIcon,
  CaretRightIcon,
  DownloadSimpleIcon,
  ListChecksIcon,
  WarningCircleIcon,
  XIcon,
} from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CategorizationBackfillCallout } from "@/components/categorization-backfill-callout";
import { GroupedCategorySelectItems } from "@/components/grouped-category-select-items";
import type { Category, CategoryTreeNode } from "@/lib/categories";
import { buildFilterSearchParams } from "@/lib/transactions/filter-params";
import { pageRange } from "@/lib/transactions/pagination";
import { PAGE_SIZES, UNCATEGORIZED } from "@/lib/transactions/view-params";
import { cn } from "@/lib/utils";
import { ActiveFilterChips, FilterControls, SearchField, hasActiveFilters } from "./filters";
import { LoadError, ListSkeleton, NoMatches, NoTransactions } from "./states";
import { TransactionFeed } from "./transaction-feed";
import { TransactionSheet } from "./transaction-sheet";
import { TransactionTable } from "./transaction-table";
import { useMediaQuery } from "./use-media-query";
import { useTransactionActions } from "./use-transaction-actions";
import { useTransactionsView } from "./use-transactions-view";

const count = new Intl.NumberFormat("he-IL");

/** The table's breakpoint (Tailwind `lg`); below it the page is a day-grouped feed. */
const DESKTOP = "(min-width: 64rem)";

export function TransactionsPage({
  categories,
  tree,
  categorizationAvailable,
}: {
  categories: Category[];
  tree: CategoryTreeNode<Category>[];
  /** A categorization provider is configured — presence only, never its settings. */
  categorizationAvailable: boolean;
}) {
  const { view, navigate, loading, failed, rows, total, viewKey, reload, updateRows } =
    useTransactionsView();
  const actions = useTransactionActions(updateRows);
  const desktop = useMediaQuery(DESKTOP);
  const categoryById = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // Selection belongs to one view: it empties itself when the view changes.
  const [selection, setSelection] = React.useState<{ key: string; ids: Set<string> }>({
    key: viewKey,
    ids: new Set(),
  });
  const selected = selection.key === viewKey ? selection.ids : new Set<string>();
  const [selecting, setSelecting] = React.useState(false);
  const [bulkCategoryId, setBulkCategoryId] = React.useState("");
  const [bulkApplying, setBulkApplying] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  function setSelected(ids: Set<string>) {
    setSelection({ key: viewKey, ids });
  }
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    const all = rows ?? [];
    setSelected(all.every((t) => selected.has(t.id)) ? new Set() : new Set(all.map((t) => t.id)));
  }
  function endSelection() {
    setSelected(new Set());
    setSelecting(false);
    setBulkCategoryId("");
  }
  async function applyBulk() {
    if (!bulkCategoryId || selected.size === 0) return;
    setBulkApplying(true);
    const ok = await actions.bulkCategorize(Array.from(selected), bulkCategoryId);
    setBulkApplying(false);
    if (ok) endSelection();
  }

  function clearFilters() {
    navigate({ categoryId: "", status: "", dateFrom: "", dateTo: "", search: "" });
  }

  const filtered = hasActiveFilters(view);
  const totalPages = Math.max(1, Math.ceil(total / view.pageSize));
  const openTx = openId ? (rows?.find((t) => t.id === openId) ?? null) : null;
  const exportHref = `/api/transactions/export?${buildFilterSearchParams(view).toString()}`;

  let body: React.ReactNode;
  if (failed) {
    body = <LoadError onRetry={reload} />;
  } else if (rows === null) {
    body = <ListSkeleton />;
  } else if (rows.length === 0) {
    body = loading ? (
      <ListSkeleton />
    ) : filtered ? (
      <NoMatches onClear={clearFilters} />
    ) : (
      <NoTransactions />
    );
  } else {
    body = (
      <div
        aria-busy={loading}
        className={cn("transition-opacity duration-150", loading && "opacity-60")}
      >
        {desktop ? (
          <TransactionTable
            rows={rows}
            categoryById={categoryById}
            tree={tree}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onOpen={setOpenId}
            actions={actions}
          />
        ) : (
          <TransactionFeed
            rows={rows}
            categoryById={categoryById}
            selecting={selecting}
            selected={selected}
            onToggle={toggle}
            onOpen={setOpenId}
          />
        )}
      </div>
    );
  }

  const showList = !failed && rows !== null && rows.length > 0;
  const { from, to } = pageRange(view.page, view.pageSize, total);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-headline font-bold">תנועות</h1>
          <div className="text-body text-muted-foreground flex h-[1.375rem] items-center tabular-nums">
            {rows === null
              ? !failed && <Skeleton className="h-4 w-24" />
              : filtered
                ? `${count.format(total)} תנועות בסינון`
                : `${count.format(total)} תנועות`}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {showList && !desktop && !selecting && (
            <Button
              variant="outline"
              onClick={() => setSelecting(true)}
              aria-label="בחירת תנועות"
              className="bg-card size-11 p-0"
            >
              <ListChecksIcon className="size-4" />
            </Button>
          )}
          <a
            href={exportHref}
            aria-label="ייצוא ל-CSV"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "bg-card size-11 px-0 lg:h-9 lg:w-auto lg:px-3",
            )}
          >
            <DownloadSimpleIcon className="size-4" />
            <span className="hidden lg:inline">ייצוא ל-CSV</span>
          </a>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-2 lg:gap-3">
        <div className="flex w-full min-w-0 items-center gap-2 lg:w-auto lg:flex-1">
          <SearchField view={view} navigate={navigate} />
          <FilterControls view={view} navigate={navigate} categoryById={categoryById} tree={tree} />
        </div>
      </div>

      <ActiveFilterChips
        view={view}
        navigate={navigate}
        categoryById={categoryById}
        onClearAll={clearFilters}
      />

      {actions.fanOutCount > 0 && (
        <Notice
          onDismiss={actions.dismissFanOut}
          action={
            <UndoButton onUndo={actions.undoFanOut} label="ביטול ההחלה" busyLabel="מבטל..." />
          }
        >
          הוחל גם על עוד {count.format(actions.fanOutCount)} תנועות של אותו בית עסק
        </Notice>
      )}

      {actions.error && openId === null && (
        <Notice onDismiss={actions.dismissError} tone="attention">
          {actions.error}
        </Notice>
      )}

      {categorizationAvailable && (
        <CategorizationBackfillCallout
          offered={view.categoryId === UNCATEGORIZED && !loading && total > 0}
          onCompleted={reload}
        />
      )}

      {(selected.size > 0 || selecting) && (
        <Card className="sticky top-2 z-10 flex-row flex-wrap items-center gap-2 p-2">
          <span className="text-body px-2 font-medium tabular-nums">
            {selected.size > 0 ? `${count.format(selected.size)} נבחרו` : "בחרו תנועות"}
          </span>
          <Select value={bulkCategoryId} onValueChange={(v) => setBulkCategoryId(v ?? "")}>
            <SelectTrigger
              aria-label="קטגוריה לתנועות שנבחרו"
              className="h-11 min-w-0 flex-1 lg:h-9 lg:w-52 lg:flex-none"
            >
              <span className="truncate">
                {bulkCategoryId
                  ? (categoryById.get(bulkCategoryId)?.name ?? "בחירת קטגוריה")
                  : "בחירת קטגוריה"}
              </span>
            </SelectTrigger>
            <SelectContent>
              <GroupedCategorySelectItems tree={tree} />
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button
              onClick={applyBulk}
              disabled={!bulkCategoryId || selected.size === 0 || bulkApplying}
              className="h-11 px-4 lg:h-9"
            >
              {bulkApplying ? "מחיל..." : "החלה"}
            </Button>
            <Button variant="ghost" onClick={endSelection} className="h-11 lg:h-9">
              ביטול
            </Button>
          </div>
        </Card>
      )}

      <section aria-label="רשימת התנועות">{body}</section>

      {showList && (
        <nav
          aria-label="עמודים"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
        >
          <div className="text-body text-muted-foreground flex items-center gap-2">
            <span className="tabular-nums">
              {count.format(from)}–{count.format(to)} מתוך {count.format(total)}
            </span>
            <Select
              value={String(view.pageSize)}
              onValueChange={(v) => v && navigate({ pageSize: Number(v) })}
            >
              <SelectTrigger aria-label="שורות בעמוד" className="h-11 w-20 lg:h-8">
                <span className="tabular-nums">{view.pageSize}</span>
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-body text-muted-foreground tabular-nums">
              עמוד {count.format(view.page)} מתוך {count.format(totalPages)}
            </span>
            <Button
              variant="outline"
              onClick={() => navigate({ page: view.page - 1 })}
              disabled={view.page <= 1}
              aria-label="לעמוד הקודם"
              className="bg-card size-11 p-0 lg:size-9"
            >
              <CaretRightIcon className="size-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate({ page: view.page + 1 })}
              disabled={view.page >= totalPages}
              aria-label="לעמוד הבא"
              className="bg-card size-11 p-0 lg:size-9"
            >
              <CaretLeftIcon className="size-4" />
            </Button>
          </div>
        </nav>
      )}

      <TransactionSheet
        tx={openTx}
        categoryById={categoryById}
        tree={tree}
        actions={actions}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

function Notice({
  children,
  action,
  onDismiss,
  tone,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  onDismiss: () => void;
  tone?: "attention";
}) {
  return (
    <div
      role={tone === "attention" ? "alert" : "status"}
      className={cn(
        "bg-muted flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl py-1.5 ps-4 pe-1.5",
        tone === "attention" && "bg-attention-subtle text-attention-text",
      )}
    >
      {tone === "attention" && <WarningCircleIcon weight="fill" className="size-4 shrink-0" />}
      <span className="text-body min-w-0 flex-1 py-1.5">{children}</span>
      <div className="flex items-center">
        {action}
        <Button variant="ghost" onClick={onDismiss} aria-label="סגירה" className="size-11 p-0">
          <XIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function UndoButton({
  onUndo,
  label,
  busyLabel,
}: {
  onUndo: () => Promise<void>;
  label: string;
  busyLabel: string;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await onUndo();
        setBusy(false);
      }}
      className="bg-card h-11 lg:h-9"
    >
      {busy ? busyLabel : label}
    </Button>
  );
}
