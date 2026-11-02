"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon } from "@/components/icons";
import { Card } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRootError,
  FormSubmit,
  applyActionErrors,
} from "@/components/ui/form";
import { monthlyTargetsSchema, type MonthlyTargetsFormValues } from "@/lib/budgets/schemas";
import { setMonthlyTargetsAction } from "@/app/actions/budgets";
import { SectionBody, SectionHeader, CONTROLS } from "./parts";
import { OptionalAmountInput } from "./amount-input";

/**
 * The monthly expense and savings targets. Saving goes through
 * `setMonthlyTargetsAction`, the one write path for targets, which the home
 * screen's suggested-target confirmation uses as well (spec #312).
 */
export function MonthlyTargetsSection({
  initialTargets,
}: {
  initialTargets: MonthlyTargetsFormValues;
}) {
  const [isPending, startTransition] = React.useTransition();
  const form = useForm<MonthlyTargetsFormValues>({
    resolver: zodResolver(monthlyTargetsSchema),
    defaultValues: initialTargets,
  });

  function onSubmit(values: MonthlyTargetsFormValues) {
    startTransition(async () => {
      const result = await setMonthlyTargetsAction(values);
      if (result.error || result.fieldErrors) {
        applyActionErrors(form, result);
        return;
      }
      form.reset(values, { keepIsSubmitSuccessful: true });
    });
  }

  const saved = form.formState.isSubmitSuccessful && !form.formState.isDirty;

  return (
    <SectionBody labelledBy="targets">
      <SectionHeader
        section="targets"
        description="יעד הוצאות כולל ויעד חיסכון נטו לחודש. שניהם אופציונליים, ושדה ריק מנקה את היעד."
      />
      <Card className={CONTROLS}>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col gap-5 px-4"
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="expenseTarget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>יעד הוצאות חודשי (₪)</FormLabel>
                    <FormControl>
                      <OptionalAmountInput
                        placeholder="ללא יעד"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <p className="text-muted-foreground text-caption">
                      הבסיס לחישוב כמה נשאר לחודש במסך הבית.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="savingsTarget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>יעד חיסכון נטו חודשי (₪)</FormLabel>
                    <FormControl>
                      <OptionalAmountInput
                        placeholder="ללא יעד"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <p className="text-muted-foreground text-caption">
                      הכנסות פחות הוצאות שתרצו לשמור בכל חודש.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormRootError />
            <div className="flex flex-wrap items-center gap-3">
              <FormSubmit
                pending={isPending}
                pendingText="שומר..."
                className="max-md:min-h-11 max-md:px-4"
              >
                שמור יעדים
              </FormSubmit>
              {saved && (
                <span
                  role="status"
                  className="text-muted-foreground text-body inline-flex items-center gap-1.5"
                >
                  <CheckIcon className="size-4" />
                  נשמר
                </span>
              )}
            </div>
          </form>
        </Form>
      </Card>
    </SectionBody>
  );
}
