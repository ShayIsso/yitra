"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretDownIcon,
  CheckIcon,
  InfoIcon,
  PiggyBankIcon,
  TrashIcon,
  TrayIcon,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { createGoalFormSchema } from "@/lib/goals/schemas";
import {
  createGoalAction,
  updateGoalAction,
  deleteGoalAction,
  reorderGoalAction,
  archiveGoalAction,
  setTrackingSinceAction,
} from "@/app/actions/goals";
import { cn } from "@/lib/utils";
import {
  AddButton,
  ROW_BUTTON,
  RowAction,
  SHEET_CONTROLS,
  SectionBody,
  SectionEmpty,
  SectionHeader,
  SettingsList,
  CONTROLS,
} from "@/components/settings/parts";
import { AmountInput } from "@/components/settings/amount-input";

type StoredGoal = {
  id: string;
  name: string;
  targetAmount: number;
  startMonth: string;
  openingAmount: number;
  targetMonth: string | null;
  priority: number;
  archivedAt: string | null;
};

type LadderStatus = {
  id: string;
  current: number;
  target: number;
  paceVerdict: "ahead-or-on-pace" | "behind-pace" | "no-deadline";
};

type GoalFormValues = z.infer<typeof createGoalFormSchema>;

function emptyForm(): GoalFormValues {
  return {
    mode: "cumulative",
    name: "",
    startMonth: "",
    openingAmount: 0,
    targetAmount: Number.NaN,
    targetMonth: null,
  };
}

/** Reopens a stored goal for editing — always in cumulative mode, since
 * per-month phrasing is entry-time sugar with no trace left in storage. */
function formFromGoal(goal: StoredGoal): GoalFormValues {
  return {
    mode: "cumulative",
    name: goal.name,
    startMonth: goal.startMonth,
    openingAmount: goal.openingAmount,
    targetAmount: goal.targetAmount,
    targetMonth: goal.targetMonth,
  };
}

/** "2026-01" -> "ינואר 2026". Client-only per CLAUDE.md's formatting rule. */
function formatMonthLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", { year: "numeric", month: "long" }).format(
    new Date(year, month - 1, 1),
  );
}

/** The pool's tracking-since editor (CONTEXT.md "savings pool"). Editing it
 * recomputes every goal's ladder progress, so the consequence is stated inline. */
function TrackingSinceEditor({ initial }: { initial: string | null }) {
  const [month, setMonth] = React.useState(initial ?? "");
  // Re-sync the field to the server value after a save revalidates (adjust
  // state during render — the pattern React recommends over an effect).
  const [prevInitial, setPrevInitial] = React.useState(initial);
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setMonth(initial ?? "");
  }

  const dirty = month !== (initial ?? "");

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setTrackingSinceAction({ month: month === "" ? null : month });
      if (result.error) setError(result.error);
    });
  }

  return (
    <Card className={cn("gap-3 px-4", CONTROLS)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
          <label className="text-body font-medium" htmlFor="tracking-since">
            מעקב מאז
          </label>
          <p className="text-muted-foreground text-caption flex items-start gap-1.5">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
            החיסכון נטו נצבר מהחודש הזה. עריכה מחשבת מחדש את ההתקדמות של כל היעדים.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            id="tracking-since"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-44"
          />
          <Button onClick={save} disabled={!dirty || isPending}>
            {isPending ? "שומר..." : "שמור"}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-body">
          {error}
        </p>
      )}
    </Card>
  );
}

/** A goal's ladder progress as a thin bar; neutral fill, since saving progress is not money colour. */
function ProgressBar({ current, target }: { current: number; target: number }) {
  const share = target > 0 ? Math.min(1, Math.max(0, current / target)) : 0;
  return (
    <span aria-hidden="true" className="bg-bar block h-1.5 w-full overflow-hidden rounded-full">
      <span
        className="bg-bar-strong block h-full rounded-full"
        style={{ width: `${share * 100}%` }}
      />
    </span>
  );
}

export function GoalsSection({
  initialGoals,
  ladderStatus,
  initialTrackingSince,
}: {
  initialGoals: StoredGoal[];
  ladderStatus: LadderStatus[];
  initialTrackingSince: string | null;
}) {
  const [goals, setGoals] = React.useState<StoredGoal[]>(initialGoals);
  const [prevInitialGoals, setPrevInitialGoals] = React.useState(initialGoals);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);
  const [editing, setEditing] = React.useState<StoredGoal | null>(null);
  const [deleting, setDeleting] = React.useState<StoredGoal | null>(null);
  const [archiving, setArchiving] = React.useState<StoredGoal | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [isDeletePending, startDeleteTransition] = React.useTransition();
  const [isArchivePending, startArchiveTransition] = React.useTransition();
  const [isReorderPending, startReorderTransition] = React.useTransition();

  // Reorder / archive / tracking-since edits recompute the ladder server-side;
  // the revalidated page hands back fresh props, which we reconcile into local
  // state here (create/edit/delete update optimistically first). Adjusting state
  // during render is the pattern React recommends over a syncing effect.
  if (initialGoals !== prevInitialGoals) {
    setPrevInitialGoals(initialGoals);
    setGoals(initialGoals);
  }

  const statusById = React.useMemo(
    () => new Map(ladderStatus.map((s) => [s.id, s])),
    [ladderStatus],
  );

  const activeGoals = React.useMemo(
    () => goals.filter((g) => g.archivedAt == null).sort((a, b) => a.priority - b.priority),
    [goals],
  );
  const archivedGoals = React.useMemo(() => goals.filter((g) => g.archivedAt != null), [goals]);

  const form = useForm<GoalFormValues>({
    resolver: zodResolver(createGoalFormSchema),
    defaultValues: emptyForm(),
  });

  const mode = useWatch({ control: form.control, name: "mode" });

  function openAdd() {
    setEditing(null);
    form.reset(emptyForm());
    setFormOpen(true);
  }

  function openEdit(goal: StoredGoal) {
    setEditing(goal);
    form.reset(formFromGoal(goal));
    setFormOpen(true);
  }

  function openDelete(goal: StoredGoal) {
    setDeleting(goal);
    setDeleteError(null);
    setDeleteOpen(true);
  }

  function openArchive(goal: StoredGoal) {
    setArchiving(goal);
    setArchiveError(null);
    setArchiveOpen(true);
  }

  function isComplete(goal: StoredGoal): boolean {
    const status = statusById.get(goal.id);
    return status != null && status.current >= status.target;
  }

  function onSubmit(values: GoalFormValues) {
    startTransition(async () => {
      const result = editing
        ? await updateGoalAction({ id: editing.id, ...values })
        : await createGoalAction(values);

      if (result.error || result.fieldErrors) {
        applyActionErrors(form, result);
        return;
      }

      const targetAmount = result.targetAmount ?? 0;
      if (editing) {
        setGoals((prev) =>
          prev.map((g) =>
            g.id === editing.id
              ? {
                  ...g,
                  name: values.name,
                  startMonth: values.startMonth,
                  openingAmount: values.openingAmount,
                  targetMonth: values.targetMonth,
                  targetAmount,
                }
              : g,
          ),
        );
      } else if ("id" in result && result.id) {
        const id = result.id;
        const nextPriority = goals.reduce((max, g) => Math.max(max, g.priority), 0) + 1;
        setGoals((prev) => [
          ...prev,
          {
            id,
            name: values.name,
            startMonth: values.startMonth,
            openingAmount: values.openingAmount,
            targetMonth: values.targetMonth,
            targetAmount,
            priority: nextPriority,
            archivedAt: null,
          },
        ]);
      }
      setFormOpen(false);
    });
  }

  function handleReorder(goal: StoredGoal, direction: "up" | "down") {
    // Optimistic swap of adjacent priorities; the render-time prevInitialGoals
    // adjustment reconciles with server truth once the action revalidates.
    setGoals((prev) => {
      const active = prev
        .filter((g) => g.archivedAt == null)
        .sort((a, b) => a.priority - b.priority);
      const index = active.findIndex((g) => g.id === goal.id);
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= active.length) return prev;
      const a = active[index];
      const b = active[swapIndex];
      return prev.map((g) => {
        if (g.id === a.id) return { ...g, priority: b.priority };
        if (g.id === b.id) return { ...g, priority: a.priority };
        return g;
      });
    });
    startReorderTransition(async () => {
      await reorderGoalAction({ id: goal.id, direction });
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startDeleteTransition(async () => {
      const result = await deleteGoalAction({ id: deleting.id });
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setGoals((prev) => prev.filter((g) => g.id !== deleting.id));
      setDeleteOpen(false);
    });
  }

  function handleArchive() {
    if (!archiving) return;
    startArchiveTransition(async () => {
      const result = await archiveGoalAction({ id: archiving.id });
      if (result.error) {
        setArchiveError(result.error);
        return;
      }
      setGoals((prev) =>
        prev.map((g) =>
          g.id === archiving.id ? { ...g, archivedAt: new Date().toISOString() } : g,
        ),
      );
      setArchiveOpen(false);
    });
  }

  const hasAnyGoal = goals.length > 0;

  return (
    <SectionBody labelledBy="goals">
      <SectionHeader
        section="goals"
        description="היעדים הפעילים מסודרים כסולם עדיפויות: החיסכון נטו המצטבר מחולק מלמעלה למטה, כל יעד עד לסכום שלו. שינוי הסדר מחשב מחדש את ההתקדמות."
        action={activeGoals.length > 0 && <AddButton label="יעד חדש" onClick={openAdd} />}
      />

      {activeGoals.length === 0 ? (
        <SectionEmpty
          icon={<PiggyBankIcon />}
          title={hasAnyGoal ? "אין יעדים פעילים" : "עדיין אין יעדי חיסכון"}
          description="יעד חיסכון הוא סכום שתרצו לצבור, למשל קרן חירום או חופשה. Yitra עוקבת אחרי ההתקדמות לפי החיסכון נטו בכל חודש."
          action={<AddButton label="יעד חדש" onClick={openAdd} />}
        />
      ) : (
        <SettingsList>
          {activeGoals.map((goal, index) => {
            const status = statusById.get(goal.id);
            const complete = isComplete(goal);
            return (
              <li key={goal.id} className="flex flex-wrap items-center gap-x-1 gap-y-0 pe-2">
                <button
                  type="button"
                  onClick={() => openEdit(goal)}
                  aria-label={`עריכת היעד ${goal.name}`}
                  className={cn(ROW_BUTTON, "basis-56")}
                >
                  <span className="bg-muted text-body flex size-10 shrink-0 items-center justify-center rounded-full font-semibold tabular-nums">
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="text-body truncate font-medium">{goal.name}</span>
                      {complete && (
                        <Badge variant="secondary">
                          <CheckIcon data-icon="inline-start" />
                          הושלם
                        </Badge>
                      )}
                    </span>
                    <span className="text-caption text-muted-foreground">
                      {status ? (
                        <>
                          <Amount amount={status.current} colorize={false} fractionDigits={0} />{" "}
                          מתוך{" "}
                          <Amount amount={goal.targetAmount} colorize={false} fractionDigits={0} />
                        </>
                      ) : (
                        <Amount amount={goal.targetAmount} colorize={false} />
                      )}{" "}
                      · מתחיל {formatMonthLabel(goal.startMonth)}
                      {goal.targetMonth && <> · עד {formatMonthLabel(goal.targetMonth)}</>}
                    </span>
                    {status && <ProgressBar current={status.current} target={status.target} />}
                  </span>
                </button>
                <div className="ms-auto flex shrink-0 items-center">
                  <RowAction
                    label={`העברת ${goal.name} למעלה`}
                    disabled={index === 0 || isReorderPending}
                    onClick={() => handleReorder(goal, "up")}
                  >
                    <ArrowUpIcon />
                  </RowAction>
                  <RowAction
                    label={`העברת ${goal.name} למטה`}
                    disabled={index === activeGoals.length - 1 || isReorderPending}
                    onClick={() => handleReorder(goal, "down")}
                  >
                    <ArrowDownIcon />
                  </RowAction>
                  {/* Archive is the completion gesture (#183): only a goal that
                      has held at 100% can be archived to release its claim. */}
                  {complete && (
                    <RowAction
                      label={`העברת ${goal.name} לארכיון`}
                      onClick={() => openArchive(goal)}
                    >
                      <TrayIcon weight="regular" />
                    </RowAction>
                  )}
                  <RowAction
                    label={`מחיקת היעד ${goal.name}`}
                    onClick={() => openDelete(goal)}
                    destructive
                  >
                    <TrashIcon />
                  </RowAction>
                </div>
              </li>
            );
          })}
        </SettingsList>
      )}

      <TrackingSinceEditor initial={initialTrackingSince} />

      {archivedGoals.length > 0 && (
        <Card className="gap-0 py-0">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring text-body flex min-h-12 w-full items-center gap-2 px-4 text-start outline-none focus-visible:ring-3 focus-visible:ring-inset"
          >
            <TrayIcon weight="regular" className="size-4" />
            <span className="flex-1">יעדים בארכיון ({archivedGoals.length})</span>
            <CaretDownIcon
              className={cn("size-4 transition-transform", showArchived && "rotate-180")}
            />
          </button>
          {showArchived && (
            <ul className="divide-border flex flex-col divide-y border-t">
              {archivedGoals.map((goal) => (
                <li
                  key={goal.id}
                  className="text-muted-foreground text-body flex min-h-12 items-center justify-between gap-3 px-4 py-2"
                >
                  <span className="min-w-0 truncate">{goal.name}</span>
                  <span className="shrink-0">
                    <Amount amount={goal.targetAmount} colorize={false} fractionDigits={0} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className={SHEET_CONTROLS}>
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת יעד חיסכון" : "יעד חיסכון חדש"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <div className="space-y-4 pb-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>שם היעד</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="לדוגמה: קרן חירום" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="startMonth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>חודש התחלה</FormLabel>
                        <FormControl>
                          <Input type="month" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="openingAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>סכום פתיחה</FormLabel>
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
                </div>

                {/* Entry-mode toggle: both resolve to the same stored
                    cumulative target (CONTEXT.md "savings goal") — this only
                    picks how the number is phrased on the way in. */}
                <div role="group" aria-label="אופן הגדרת הסכום" className="flex gap-2">
                  <Button
                    type="button"
                    variant={mode === "cumulative" ? "default" : "outline"}
                    aria-pressed={mode === "cumulative"}
                    onClick={() => form.setValue("mode", "cumulative")}
                  >
                    סכום כולל
                  </Button>
                  <Button
                    type="button"
                    variant={mode === "monthly" ? "default" : "outline"}
                    aria-pressed={mode === "monthly"}
                    onClick={() => form.setValue("mode", "monthly", { shouldValidate: false })}
                  >
                    סכום לחודש
                  </Button>
                </div>

                {mode === "cumulative" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="targetAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>סכום יעד כולל</FormLabel>
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

                    <FormField
                      control={form.control}
                      name="targetMonth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>חודש יעד (אופציונלי)</FormLabel>
                          <FormControl>
                            <Input
                              type="month"
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value || null)}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="monthlyAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>סכום לחודש</FormLabel>
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

                    <FormField
                      control={form.control}
                      name="targetMonth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>עד תאריך</FormLabel>
                          <FormControl>
                            <Input
                              type="month"
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value)}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

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

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className={SHEET_CONTROLS}>
          <DialogHeader>
            <DialogTitle>העברת יעד לארכיון</DialogTitle>
            <DialogDescription>
              להעביר את היעד &quot;{archiving?.name}&quot; לארכיון? היעד ישוחרר מסולם העדיפויות
              והמאגר המשותף יזרום מחדש ליעדים שמתחתיו. היעד יישאר לצפייה בהיסטוריה בלבד.
            </DialogDescription>
          </DialogHeader>
          {archiveError && (
            <p role="alert" className="text-destructive text-body">
              {archiveError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setArchiveOpen(false)}
              disabled={isArchivePending}
            >
              ביטול
            </Button>
            <Button onClick={handleArchive} disabled={isArchivePending}>
              {isArchivePending ? "מעביר..." : "העבר לארכיון"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className={SHEET_CONTROLS}>
          <DialogHeader>
            <DialogTitle>מחיקת יעד</DialogTitle>
            <DialogDescription>
              האם למחוק את היעד &quot;{deleting?.name}&quot;? הפעולה אינה הפיכה.
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
