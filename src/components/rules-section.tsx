"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
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
import { Badge } from "@/components/ui/badge";
import {
  CheckIcon,
  ListChecksIcon,
  MagnifyingGlassIcon,
  SparkleIcon,
  TrashIcon,
} from "@/components/icons";
import { createRuleSchema } from "@/lib/categories/schemas";
import { cn } from "@/lib/utils";
// Value import from the pure hierarchy module (no DB dependency) — importing
// this client component's other category bindings from "@/lib/categories"
// itself would pull the Drizzle-backed index.ts (and postgres) into the
// client bundle, per Next's module-not-found trace on Node builtins.
import { firstAssignableCategoryId } from "@/lib/categories/hierarchy";
import type { Category, CategoryTreeNode } from "@/lib/categories";
import {
  CategoryDot,
  GroupedCategorySelectItems,
} from "@/components/grouped-category-select-items";
import {
  AddButton,
  RowAction,
  SHEET_CONTROLS,
  SectionBody,
  SectionEmpty,
  SectionHeader,
  SettingsList,
  SettingsRow,
  CONTROLS,
} from "@/components/settings/parts";
import {
  previewRetroactiveApplyAction,
  applyRetroactivelyAction,
  createRuleAction,
  updateRuleAction,
  deleteRuleAction,
} from "@/app/actions/rules";

type MatchType = "contains" | "starts_with" | "exact" | "regex";

type CategoryRule = {
  id: string;
  categoryId: string;
  matchType: MatchType;
  pattern: string;
  priority: number;
};

const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  contains: "מכיל",
  starts_with: "מתחיל ב",
  exact: "מדויק",
  regex: "ביטוי רגולרי",
};

// A list past this size gets a search field (#181); rules are authored
// deliberately (ADR-0010), so most installs never reach it.
const SEARCH_THRESHOLD = 8;

type RuleFormValues = z.infer<typeof createRuleSchema>;

function emptyForm(tree: CategoryTreeNode<Category>[]): RuleFormValues {
  return {
    categoryId: firstAssignableCategoryId(tree),
    matchType: "contains",
    pattern: "",
    priority: 0,
  };
}

export function RulesSection({
  initialRules,
  categories,
  tree,
}: {
  initialRules: CategoryRule[];
  categories: Category[];
  tree: CategoryTreeNode<Category>[];
}) {
  const [rules, setRules] = React.useState<CategoryRule[]>(initialRules);
  const [search, setSearch] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [applyOpen, setApplyOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CategoryRule | null>(null);
  const [deleting, setDeleting] = React.useState<CategoryRule | null>(null);
  const [applying, setApplying] = React.useState<CategoryRule | null>(null);
  const [applyPreviewCount, setApplyPreviewCount] = React.useState<number | null>(null);
  const [applySuccess, setApplySuccess] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [isDeletePending, startDeleteTransition] = React.useTransition();

  const form = useForm<RuleFormValues>({
    resolver: zodResolver(createRuleSchema),
    defaultValues: emptyForm(tree),
  });

  const categoryMap = React.useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const categoryColor = React.useMemo(
    () => new Map(categories.map((c) => [c.id, c.color])),
    [categories],
  );

  const hasRules = rules.length > 0;

  const filteredRules = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter(
      (r) =>
        r.pattern.toLowerCase().includes(q) ||
        (categoryMap[r.categoryId] ?? "").toLowerCase().includes(q),
    );
  }, [rules, search, categoryMap]);

  function openAdd() {
    setEditing(null);
    form.reset(emptyForm(tree));
    setFormOpen(true);
  }

  function openEdit(rule: CategoryRule) {
    setEditing(rule);
    form.reset({
      categoryId: rule.categoryId,
      matchType: rule.matchType,
      pattern: rule.pattern,
      priority: rule.priority,
    });
    setFormOpen(true);
  }

  function openDelete(rule: CategoryRule) {
    setDeleting(rule);
    setDeleteError(null);
    setDeleteOpen(true);
  }

  async function openApply(rule: CategoryRule) {
    setApplying(rule);
    setApplyPreviewCount(null);
    setApplySuccess(null);
    setError(null);
    setApplyOpen(true);
    const result = await previewRetroactiveApplyAction({ ruleId: rule.id });
    if (result.error) {
      setError(result.error);
    } else {
      setApplyPreviewCount(result.count ?? 0);
    }
  }

  function onSubmit(values: RuleFormValues) {
    startTransition(async () => {
      const result = editing
        ? await updateRuleAction({ id: editing.id, ...values })
        : await createRuleAction(values);

      if (result.error || result.fieldErrors) {
        // Server-side validation lands in the same inline mechanism as client errors.
        applyActionErrors(form, result);
        return;
      }

      // Optimistic local state, layered on top of the server revalidation.
      if (editing) {
        setRules((prev) =>
          prev
            .map((r) => (r.id === editing.id ? { ...r, ...values } : r))
            .sort((a, b) => b.priority - a.priority),
        );
      } else if ("id" in result && result.id) {
        const id = result.id;
        setRules((prev) => [...prev, { id, ...values }].sort((a, b) => b.priority - a.priority));
      }
      setFormOpen(false);
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startDeleteTransition(async () => {
      const result = await deleteRuleAction({ id: deleting.id });
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setRules((prev) => prev.filter((r) => r.id !== deleting.id));
      setDeleteOpen(false);
    });
  }

  async function handleApply() {
    if (!applying) return;
    setSaving(true);
    setError(null);
    try {
      const result = await applyRetroactivelyAction({ ruleId: applying.id });
      if (result.error) {
        setError(result.error);
        return;
      }
      const count = result.applied ?? 0;
      setApplySuccess(
        count === 0 ? "לא נמצאו עסקאות לא מסווגות התואמות לכלל זה" : `סווגו ${count} עסקאות בהצלחה`,
      );
    } catch {
      setError("שגיאה בעת יישום הכלל");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionBody labelledBy="rules">
      <SectionHeader
        section="rules"
        description="כלל משייך לקטגוריה כל תנועה שהתיאור שלה מתאים לתבנית. כשכמה כללים מתאימים, הכלל בעדיפות הגבוהה יותר קובע."
        action={hasRules && <AddButton label="כלל חדש" onClick={openAdd} />}
      />

      {rules.length > SEARCH_THRESHOLD && (
        <div className={cn("relative", CONTROLS)}>
          <MagnifyingGlassIcon className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי תבנית או קטגוריה"
            aria-label="חיפוש כללים"
            dir="auto"
            className="ps-9"
          />
        </div>
      )}

      {!hasRules ? (
        <SectionEmpty
          icon={<ListChecksIcon />}
          title="עדיין אין כללי סיווג"
          description="סיווג ידני של תנועה כבר נזכר לפעם הבאה. כלל מתאים כשרוצים לסווג בבת אחת כל תנועה שהתיאור שלה מתאים לתבנית."
          action={<AddButton label="כלל חדש" onClick={openAdd} />}
        />
      ) : filteredRules.length === 0 ? (
        <p className="text-muted-foreground text-body py-6 text-center">
          לא נמצאו כללים תואמים לחיפוש
        </p>
      ) : (
        <SettingsList>
          {filteredRules.map((rule) => {
            const categoryName = categoryMap[rule.categoryId] ?? "קטגוריה לא ידועה";
            const color = categoryColor.get(rule.categoryId);
            return (
              <SettingsRow
                key={rule.id}
                onOpen={() => openEdit(rule)}
                openLabel={`עריכת הכלל ${rule.pattern}`}
                title={
                  <bdi dir="auto" title={rule.pattern}>
                    {rule.pattern}
                  </bdi>
                }
                subtitle={
                  <>
                    <Badge variant="outline" className="text-muted-foreground font-normal">
                      {MATCH_TYPE_LABELS[rule.matchType]}
                    </Badge>
                    <span className="inline-flex min-w-0 items-center gap-1">
                      {color && <CategoryDot color={color} />}
                      <span className="truncate">{categoryName}</span>
                    </span>
                    <span className="tabular-nums">עדיפות {rule.priority}</span>
                  </>
                }
                trailing={
                  <>
                    <RowAction
                      label={`יישום הכלל ${rule.pattern} על תנועות קיימות`}
                      onClick={() => openApply(rule)}
                    >
                      <SparkleIcon weight="regular" />
                    </RowAction>
                    <RowAction
                      label={`מחיקת הכלל ${rule.pattern}`}
                      onClick={() => openDelete(rule)}
                      destructive
                    >
                      <TrashIcon />
                    </RowAction>
                  </>
                }
              />
            );
          })}
        </SettingsList>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className={SHEET_CONTROLS}>
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת כלל" : "כלל חדש"}</DialogTitle>
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
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <span>{categoryMap[field.value] ?? "בחר קטגוריה"}</span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <GroupedCategorySelectItems tree={tree} />
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="matchType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>סוג התאמה</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          if (v) field.onChange(v);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <span>{MATCH_TYPE_LABELS[field.value]}</span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(Object.keys(MATCH_TYPE_LABELS) as MatchType[]).map((t) => (
                            <SelectItem key={t} value={t}>
                              {MATCH_TYPE_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pattern"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>תבנית</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="לדוגמה: שופרסל" dir="auto" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>עדיפות</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="numeric"
                          dir="ltr"
                          className="text-end tabular-nums"
                          min={0}
                          value={Number.isNaN(field.value) ? "" : field.value}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === "" ? Number.NaN : Number(e.target.value),
                            )
                          }
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <p className="text-muted-foreground text-caption">
                        מספר גבוה יותר גובר כשכמה כללים מתאימים לאותה תנועה.
                      </p>
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
            <DialogTitle>מחיקת כלל</DialogTitle>
            <DialogDescription>
              האם למחוק את הכלל עבור &quot;<bdi>{deleting?.pattern}</bdi>&quot;? תנועות שכבר סווגו
              לפיו נשארות כפי שהן.
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

      <Dialog
        open={applyOpen}
        onOpenChange={(open) => {
          if (!open) {
            setApplyOpen(false);
            setApplying(null);
            setApplyPreviewCount(null);
            setApplySuccess(null);
            setError(null);
          }
        }}
      >
        <DialogContent className={SHEET_CONTROLS}>
          <DialogHeader>
            <DialogTitle>יישום על עסקאות קיימות</DialogTitle>
          </DialogHeader>
          <div className="text-body pb-4">
            {applySuccess ? (
              <p role="status" className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 size-4 shrink-0" />
                {applySuccess}
              </p>
            ) : applyPreviewCount === null && !error ? (
              <p className="text-muted-foreground">בודק עסקאות...</p>
            ) : error ? (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            ) : (
              <p>
                {applyPreviewCount === 0
                  ? "לא נמצאו עסקאות לא מסווגות התואמות לכלל זה."
                  : `כלל זה יסווג ${applyPreviewCount} עסקאות לא מסווגות. להמשיך?`}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setApplyOpen(false);
                setApplying(null);
                setApplyPreviewCount(null);
                setApplySuccess(null);
                setError(null);
              }}
              disabled={saving}
            >
              {applySuccess ? "סגור" : "ביטול"}
            </Button>
            {!applySuccess && applyPreviewCount !== null && applyPreviewCount > 0 && (
              <Button onClick={handleApply} disabled={saving}>
                {saving ? "מסווג..." : "יישם"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionBody>
  );
}
