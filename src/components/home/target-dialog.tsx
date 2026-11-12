"use client";

import * as React from "react";
import { setMonthlyTargetsAction } from "@/app/actions/budgets";
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
import { Label } from "@/components/ui/label";
import { OptionalAmountInput } from "@/components/settings/amount-input";
import type { MonthlyTargetsData } from "@/lib/budgets";
import type { HomeMonth } from "./month";

type SavingsRead =
  | { status: "loading" }
  | { status: "ready"; value: number | null }
  | { status: "failed" };

/**
 * Confirms or edits the suggested monthly expense target before anything is
 * written (#312: a suggestion is never applied silently). Saving goes through
 * `setMonthlyTargetsAction`, the one write path for targets, which replaces
 * both targets at once, so the current savings target is written back
 * unchanged: the one the sections already read, or, before they have, a read
 * of its own.
 */
export default function TargetDialog({
  month,
  suggested,
  usualMonth,
  knownTargets,
  onClose,
  onSaved,
}: {
  month: HomeMonth;
  suggested: number | null;
  usualMonth: number | null;
  /** The targets the home screen's sections already read; null until they have. */
  knownTargets: MonthlyTargetsData | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const inputId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [value, setValue] = React.useState<number | null>(suggested);
  const [error, setError] = React.useState<string | null>(null);
  const [savings, setSavings] = React.useState<SavingsRead>(() =>
    knownTargets ? { status: "ready", value: knownTargets.savingsTarget } : { status: "loading" },
  );
  const needsRead = knownTargets === null;
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!needsRead) return;
    const controller = new AbortController();
    fetch(`/api/budgets-summary?year=${month.year}&month=${month.month}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { monthlyTargets: MonthlyTargetsData }) =>
        setSavings({ status: "ready", value: body.monthlyTargets.savingsTarget }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setSavings({ status: "failed" });
      });
    return () => controller.abort();
  }, [needsRead, month.year, month.month]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (savings.status !== "ready") return;
    if (value === null || !(value > 0)) {
      setError("הזינו סכום חיובי");
      return;
    }
    startTransition(async () => {
      const result = await setMonthlyTargetsAction({
        expenseTarget: value,
        savingsTarget: savings.value,
      });
      if (result.error) {
        setError(result.fieldErrors?.expenseTarget ?? result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="md:max-w-md" initialFocus={inputRef}>
        <form onSubmit={save} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="text-title font-semibold">יעד הוצאות חודשי</DialogTitle>
            <DialogDescription className="text-body text-pretty">
              {usualMonth !== null && suggested !== null ? (
                <>
                  בחודש רגיל יוצאות אצלך בערך{" "}
                  <Amount amount={usualMonth} colorize={false} fractionDigits={0} />, אז הצענו{" "}
                  <Amount amount={suggested} colorize={false} fractionDigits={0} />. אפשר לשנות את
                  הסכום לפני השמירה.
                </>
              ) : (
                "כמה תרצו להוציא בחודש? מהיעד הזה מחושב כמה נשאר לכם בכל חודש."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor={inputId} className="text-body">
              יעד הוצאות לחודש (₪)
            </Label>
            <OptionalAmountInput
              id={inputId}
              ref={inputRef}
              className="text-title md:text-title h-12"
              value={value}
              onChange={(next) => {
                setValue(next);
                setError(null);
              }}
              aria-invalid={error !== null || undefined}
              aria-describedby={error ? `${inputId}-error` : undefined}
            />
            <p className="text-muted-foreground text-caption">
              אפשר לשנות אותו בכל עת בהגדרות, תחת יעדים חודשיים.
            </p>
            {error && (
              <p id={`${inputId}-error`} role="alert" className="text-destructive text-body">
                {error}
              </p>
            )}
            {savings.status === "failed" && (
              <p role="alert" className="text-destructive text-body">
                לא הצלחנו לקרוא את היעדים הקיימים, ולכן אי אפשר לשמור כרגע. נסו שוב מאוחר יותר.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className="md:h-9" onClick={onClose}>
              ביטול
            </Button>
            <Button
              type="submit"
              className="md:h-9 md:px-4"
              disabled={pending || savings.status !== "ready"}
            >
              {pending ? "שומר..." : "שמירת היעד"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
