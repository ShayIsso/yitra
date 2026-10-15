"use client";

import { useId, useState, useTransition } from "react";
import { CircleCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PasswordSource } from "@/lib/auth";
import type { FieldErrors } from "@/lib/api-utils";
import { MIN_PASSWORD_LENGTH } from "@/lib/onboarding/schemas";
import { StepFooter } from "./step-footer";
import type { StepNavigation } from "./step-navigation";

export type SubmitPassword = (input: {
  password: string;
  confirmation: string;
}) => Promise<{ error?: string; fieldErrors?: FieldErrors }>;

export type PasswordStepProps = {
  readonly navigation: StepNavigation;
  readonly passwordSource: PasswordSource;
  readonly submitPassword: SubmitPassword;
};

/**
 * The only mandatory step. Once any password exists the form is never shown
 * again — returning here shows where the password comes from instead, since
 * the claim would be refused anyway (ADR-0014 §4).
 */
export function PasswordStep({ navigation, passwordSource, submitPassword }: PasswordStepProps) {
  if (passwordSource !== "none") {
    return (
      <div className="flex flex-col gap-6">
        <div className="bg-muted flex items-start gap-3 rounded-lg px-4 py-4 text-sm">
          <CircleCheck className="text-muted-foreground mt-0.5 size-5 shrink-0" />
          {passwordSource === "environment" ? (
            <p>
              הסיסמה מוגדרת במשתנה הסביבה{" "}
              <code dir="ltr" className="font-mono text-xs">
                APP_PASSWORD
              </code>{" "}
              ולכן אין צורך להגדיר אותה כאן.
            </p>
          ) : (
            <p>הסיסמה כבר הוגדרה.</p>
          )}
        </div>
        <StepFooter navigation={navigation} />
      </div>
    );
  }

  return <PasswordForm navigation={navigation} submitPassword={submitPassword} />;
}

function PasswordForm({ navigation, submitPassword }: Omit<PasswordStepProps, "passwordSource">) {
  const passwordId = useId();
  const confirmationId = useId();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await submitPassword({ password, confirmation });
      if (result.fieldErrors || result.error) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.fieldErrors ? null : (result.error ?? null));
        return;
      }
      navigation.advance();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={passwordId}>סיסמה</Label>
          <Input
            id={passwordId}
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={fieldErrors.password ? true : undefined}
            disabled={pending}
          />
          <p
            className={
              fieldErrors.password ? "text-destructive text-xs" : "text-muted-foreground text-xs"
            }
          >
            {fieldErrors.password ?? `לפחות ${MIN_PASSWORD_LENGTH} תווים`}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={confirmationId}>אימות סיסמה</Label>
          <Input
            id={confirmationId}
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            aria-invalid={fieldErrors.confirmation ? true : undefined}
            disabled={pending}
          />
          {fieldErrors.confirmation && (
            <p className="text-destructive text-xs">{fieldErrors.confirmation}</p>
          )}
        </div>
        {formError && (
          <p role="alert" className="text-destructive text-sm">
            {formError}
          </p>
        )}
      </div>
      <StepFooter
        navigation={navigation}
        primary={{
          label: "שמירה והמשך",
          type: "submit",
          pending,
          disabled: !password || !confirmation,
        }}
      />
    </form>
  );
}
