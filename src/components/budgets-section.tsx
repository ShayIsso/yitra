"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FunnelIcon, TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectTrigger } from "@/components/ui/select";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormRootError,
  FormSubmit,
  applyActionErrors,
} from "@/components/ui/form";
import { Amount } from "@/components/ui/amount";
import { CategoryDot, FilterCategorySelectItems } from "@/components/grouped-category-select-items";
// Value import from the pure hierarchy module (no DB dependency) — prior art
// categories-section.tsx does the same to keep the client bundle off "@/lib/categories"'s
// Drizzle-backed index.ts.
import { buildCategoryTree, type CategoryTreeNode } from "@/lib/categories/hierarchy";
import type { Category } from "@/lib/categories";
import { createBudgetSchema } from "@/lib/budgets/schemas";
import { createBudgetAction, updateBudgetAction, deleteBudgetAction } from "@/app/actions/budgets";
import {
  AddButton,
  RowAction,
  RowTile,
  SHEET_CONTROLS,
  SectionBody,
  SectionEmpty,
  SectionHeader,
  SettingsList,
  SettingsRow,
} from "@/components/settings/parts";
import { AmountInput } from "@/components/settings/amount-input";

type StoredBudget = {
  id: string;
  categoryId: string;
  monthlyLimit: number;
};

type BudgetFormValues = z.infer<typeof createBudgetSchema>;

function firstCategoryId(tree: CategoryTreeNode<Category>[]): string {
  return tree[0]?.id ?? "";
}

function emptyForm(expenseTree: CategoryTreeNode<Category>[]): BudgetFormValues {
  return { categoryId: firstCategoryId(expenseTree), monthlyLimit: Number.NaN };
}

export function BudgetsSection({
  initialBudgets,
  categories,
}: {
  initialBudgets: StoredBudget[];
  categories: Category[];
}) {
  const [budgets, setBudgets] = React.useState<StoredBudget[]>(initialBudgets);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<StoredBudget | null>(null);
  const [deleting, setDeleting] = React.useState<StoredBudget | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [isDeletePending, startDeleteTransition] = React.useTransition();

  const categoryById = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const groupIds = React.useMemo(
    () => new Set(categories.filter((c) => c.parentId !== null).map((c) => c.parentId!)),
    [categories],
  );

  // Only expense-type categories/groups are budgetable (decision record #105
  // §10) — unlike leaf-only assignment pickers, a group IS offered here since
  // a group budget measures its subtree's spend.
  const expenseTree = React.useMemo(
    (): CategoryTreeNode<Category>[] =>
      buildCategoryTree(categories.filter((c) => c.type === "expense")),
    [categories],
  );

  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(createBudgetSchema),
    defaultValues: emptyForm(expenseTree),
  });

  function openAdd() {
    setEditing(null);
    form.reset(emptyForm(expenseTree));
    setFormOpen(true);
  }

  function openEdit(budget: StoredBudget) {
    setEditing(budget);
    form.reset({ categoryId: budget.categoryId, monthlyLimit: budget.monthlyLimit });
    setFormOpen(true);
  }

  function openDelete(budget: StoredBudget) {
    setDeleting(budget);
    setDeleteError(null);
    setDeleteOpen(true);
  }

  function onSubmit(values: BudgetFormValues) {
    startTransition(async () => {
      const result = editing
        ? await updateBudgetAction({ id: editing.id, monthlyLimit: values.monthlyLimit })
        : await createBudgetAction(values);

      if (result.error || result.fieldErrors) {
        applyActionErrors(form, result);
        return;
      }

      if (editing) {
        setBudgets((prev) =>
          prev.map((b) => (b.id === editing.id ? { ...b, monthlyLimit: values.monthlyLimit } : b)),
        );
      } else if ("id" in result && result.id) {
        const id = result.id;
        setBudgets((prev) => [
          ...prev,
          { id, categoryId: values.categoryId, monthlyLimit: values.monthlyLimit },
        ]);
      }
      setFormOpen(false);
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startDeleteTransition(async () => {
      const result = await deleteBudgetAction({ id: deleting.id });
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setBudgets((prev) => prev.filter((b) => b.id !== deleting.id));
      setDeleteOpen(false);
    });
  }

  const selectedCategory = categoryById.get(
    useWatch({ control: form.control, name: "categoryId" }),
  );

  return (
    <SectionBody labelledBy="budgets">
      <SectionHeader
        section="budgets"
        description="תקרת הוצאה חודשית לקטגוריית הוצאה או לקבוצה, לפי סך ההוצאות בתת-העץ שלה. מתאפסת בכל חודש."
        action={budgets.length > 0 && <AddButton label="תקציב חדש" onClick={openAdd} />}
      />

      {budgets.length === 0 ? (
        <SectionEmpty
          icon={<FunnelIcon />}
          title="עדיין לא הוגדרו תקציבים"
          description="תקציב שם תקרה חודשית לקטגוריה או לקבוצה, ומסך הבית מראה כמה ממנה כבר נוצל."
          action={<AddButton label="תקציב חדש" onClick={openAdd} />}
        />
      ) : (
        <SettingsList>
          {budgets.map((budget) => {
            const category = categoryById.get(budget.categoryId);
            const name = category?.name ?? "קטגוריה לא ידועה";
            return (
              <SettingsRow
                key={budget.id}
                onOpen={() => openEdit(budget)}
                openLabel={`עריכת התקציב של ${name}`}
                leading={
                  <RowTile>
                    <FunnelIcon />
                  </RowTile>
                }
                title={name}
                subtitle={
                  <>
                    {category && <CategoryDot color={category.color} />}
                    {category && groupIds.has(category.id) && <span>קבוצה ·</span>}
                    <span>
                      <Amount amount={budget.monthlyLimit} colorize={false} fractionDigits={0} />{" "}
                      לחודש
                    </span>
                  </>
                }
                trailing={
                  <RowAction
                    label={`מחיקת התקציב של ${name}`}
                    onClick={() => openDelete(budget)}
                    destructive
                  >
                    <TrashIcon />
                  </RowAction>
                }
              />
            );
          })}
        </SettingsList>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className={SHEET_CONTROLS}>
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת תקציב" : "תקציב חדש"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <div className="space-y-4 pb-4">
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>קטגוריה</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          if (v) field.onChange(v);
                        }}
                        disabled={!!editing}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <span className="flex items-center gap-1.5">
                              {selectedCategory && <CategoryDot color={selectedCategory.color} />}
                              {selectedCategory?.name ?? "בחר קטגוריה"}
                            </span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <FilterCategorySelectItems tree={expenseTree} />
                        </SelectContent>
                      </Select>
                      {editing ? (
                        <p className="text-muted-foreground text-caption">
                          לא ניתן לשנות את הקטגוריה של תקציב קיים — יש למחוק וליצור מחדש.
                        </p>
                      ) : (
                        <FormMessage />
                      )}
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="monthlyLimit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>תקרה חודשית (₪)</FormLabel>
                      <FormControl>
                        <AmountInput
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                          min={0}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormRootError />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormOpen(false)}
                  disabled={isPending}
                >
                  ביטול
                </Button>
                <FormSubmit pending={isPending} pendingText="שומר...">
                  שמור
                </FormSubmit>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className={SHEET_CONTROLS}>
          <DialogHeader>
            <DialogTitle>מחיקת תקציב</DialogTitle>
            <DialogDescription>
              האם למחוק את התקציב עבור &quot;
              {deleting && categoryById.get(deleting.categoryId)?.name}
              &quot;? הפעולה אינה הפיכה.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-destructive text-body">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={isDeletePending}
            >
              ביטול
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeletePending}>
              {isDeletePending ? "מוחק..." : "מחק"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionBody>
  );
}
