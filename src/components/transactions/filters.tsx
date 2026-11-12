"use client";

import * as React from "react";
import { FunnelIcon, MagnifyingGlassIcon, XIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { FilterCategorySelectItems } from "@/components/grouped-category-select-items";
import type { Category, CategoryTreeNode } from "@/lib/categories";
import { NEEDS_REVIEW, UNCATEGORIZED, type TransactionsView } from "@/lib/transactions/view-params";
import { cn } from "@/lib/utils";
import { shortDay } from "./days";
import { STATUS_LABELS } from "./row-parts";

type Navigate = (patch: Partial<TransactionsView>, opts?: { replace?: boolean }) => void;

function categoryFilterLabel(
  categoryId: string,
  categoryById: ReadonlyMap<string, Category>,
): string {
  if (categoryId === UNCATEGORIZED) return "ללא קטגוריה";
  if (categoryId === NEEDS_REVIEW) return "ממתין לסקירה";
  return categoryById.get(categoryId)?.name ?? "קטגוריה";
}

/** The free-text search; typing settles into the URL after a short pause. */
export function SearchField({ view, navigate }: { view: TransactionsView; navigate: Navigate }) {
  const [draft, setDraft] = React.useState(view.search);
  const [synced, setSynced] = React.useState(view.search);
  // Back/forward or a cleared filter changes the URL's search under us.
  if (view.search !== synced) {
    setSynced(view.search);
    setDraft(view.search);
  }

  React.useEffect(() => {
    if (draft === view.search) return;
    const timer = setTimeout(() => navigate({ search: draft }, { replace: true }), 300);
    return () => clearTimeout(timer);
  }, [draft, view.search, navigate]);

  return (
    <div className="relative min-w-0 flex-1">
      <MagnifyingGlassIcon className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
      <Input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="חיפוש לפי תיאור"
        aria-label="חיפוש לפי תיאור"
        className="bg-card h-11 ps-9 lg:h-9"
      />
    </div>
  );
}

function FilterFields({
  view,
  navigate,
  categoryById,
  tree,
  stacked,
}: {
  view: TransactionsView;
  navigate: Navigate;
  categoryById: ReadonlyMap<string, Category>;
  tree: CategoryTreeNode<Category>[];
  stacked: boolean;
}) {
  const id = React.useId();
  const control = stacked ? "h-11 w-full" : "h-9";
  const field = cn("flex flex-col gap-1.5", stacked && "w-full");
  const label = "text-caption text-muted-foreground font-medium";
  return (
    <>
      <div className={field}>
        <span className={label} id={`${id}-category`}>
          קטגוריה
        </span>
        <Select
          value={view.categoryId || "__all__"}
          onValueChange={(v) => navigate({ categoryId: !v || v === "__all__" ? "" : v })}
        >
          <SelectTrigger
            aria-labelledby={`${id}-category`}
            className={cn(control, !stacked && "w-48")}
          >
            <span className="truncate">
              {view.categoryId ? categoryFilterLabel(view.categoryId, categoryById) : "הכל"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">הכל</SelectItem>
            <SelectItem value={UNCATEGORIZED}>ללא קטגוריה</SelectItem>
            <SelectItem value={NEEDS_REVIEW}>ממתין לסקירה</SelectItem>
            <FilterCategorySelectItems tree={tree} />
          </SelectContent>
        </Select>
      </div>
      <div className={field}>
        <span className={label} id={`${id}-status`}>
          סטטוס
        </span>
        <Select
          value={view.status || "__all__"}
          onValueChange={(v) => navigate({ status: !v || v === "__all__" ? "" : v })}
        >
          <SelectTrigger
            aria-labelledby={`${id}-status`}
            className={cn(control, !stacked && "w-32")}
          >
            <span>{STATUS_LABELS[view.status] ?? "הכל"}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">הכל</SelectItem>
            <SelectItem value="completed">הושלם</SelectItem>
            <SelectItem value="pending">ממתין</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className={cn(stacked && "grid w-full grid-cols-2 gap-3", !stacked && "contents")}>
        <label className={field}>
          <span className={label}>מתאריך</span>
          <Input
            type="date"
            value={view.dateFrom}
            max={view.dateTo || undefined}
            onChange={(e) => navigate({ dateFrom: e.target.value }, { replace: true })}
            className={cn(control, !stacked && "w-36")}
          />
        </label>
        <label className={field}>
          <span className={label}>עד תאריך</span>
          <Input
            type="date"
            value={view.dateTo}
            min={view.dateFrom || undefined}
            onChange={(e) => navigate({ dateTo: e.target.value }, { replace: true })}
            className={cn(control, !stacked && "w-36")}
          />
        </label>
      </div>
    </>
  );
}

function activeFilterCount(view: TransactionsView): number {
  return [view.categoryId, view.status, view.dateFrom || view.dateTo].filter(Boolean).length;
}

export function hasActiveFilters(view: TransactionsView): boolean {
  return activeFilterCount(view) > 0 || view.search !== "";
}

/** Phone: a filter button opening the fields as a sheet. Desktop: the fields inline. */
export function FilterControls(props: {
  view: TransactionsView;
  navigate: Navigate;
  categoryById: ReadonlyMap<string, Category>;
  tree: CategoryTreeNode<Category>[];
}) {
  const [open, setOpen] = React.useState(false);
  const count = activeFilterCount(props.view);
  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="bg-card h-11 gap-1.5 px-3 lg:hidden"
        aria-label={count > 0 ? `סינון, ${count} פעילים` : "סינון"}
      >
        <FunnelIcon className="size-4" />
        סינון
        {count > 0 && (
          <span className="bg-primary text-primary-foreground text-caption grid size-5 place-items-center rounded-full tabular-nums">
            {count}
          </span>
        )}
      </Button>
      <div className="hidden items-end gap-3 lg:flex">
        <FilterFields {...props} stacked={false} />
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-title font-semibold">סינון תנועות</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FilterFields {...props} stacked />
          </div>
          <DialogFooter>
            {count > 0 && (
              <Button
                variant="outline"
                onClick={() =>
                  props.navigate({ categoryId: "", status: "", dateFrom: "", dateTo: "" })
                }
              >
                ניקוי הסינון
              </Button>
            )}
            <Button onClick={() => setOpen(false)}>הצגת התנועות</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** What the view is narrowed to, each removable; the deep-linked state made visible. */
export function ActiveFilterChips({
  view,
  navigate,
  categoryById,
  onClearAll,
}: {
  view: TransactionsView;
  navigate: Navigate;
  categoryById: ReadonlyMap<string, Category>;
  onClearAll: () => void;
}) {
  const chips: { key: string; label: string; clear: Partial<TransactionsView> }[] = [];
  if (view.categoryId)
    chips.push({
      key: "category",
      label: categoryFilterLabel(view.categoryId, categoryById),
      clear: { categoryId: "" },
    });
  if (view.status)
    chips.push({
      key: "status",
      label: STATUS_LABELS[view.status] ?? view.status,
      clear: { status: "" },
    });
  if (view.dateFrom || view.dateTo) {
    const label =
      view.dateFrom && view.dateTo
        ? `${shortDay(view.dateFrom)} – ${shortDay(view.dateTo)}`
        : view.dateFrom
          ? `מ־${shortDay(view.dateFrom)}`
          : `עד ${shortDay(view.dateTo)}`;
    chips.push({ key: "dates", label, clear: { dateFrom: "", dateTo: "" } });
  }
  if (view.search) chips.push({ key: "search", label: `"${view.search}"`, clear: { search: "" } });
  if (chips.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="סינון פעיל">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={() => navigate(chip.clear)}
            aria-label={`הסרת הסינון: ${chip.label}`}
            className="bg-muted hover:bg-accent text-body focus-visible:ring-ring/50 inline-flex h-11 max-w-[16rem] items-center gap-1.5 rounded-lg ps-3.5 pe-2.5 outline-none focus-visible:ring-3 lg:h-8"
          >
            <span className="truncate">{chip.label}</span>
            <XIcon className="text-muted-foreground size-3.5 shrink-0" />
          </button>
        </li>
      ))}
      {chips.length > 1 && (
        <li>
          <Button variant="ghost" onClick={onClearAll} className="h-11 lg:h-8">
            ניקוי הכל
          </Button>
        </li>
      )}
    </ul>
  );
}
