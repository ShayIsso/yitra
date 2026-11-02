"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { CheckCircleIcon, WarningCircleIcon } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PasswordSource } from "@/lib/auth";
import type { FieldErrors } from "@/lib/api-utils";
import { MIN_PASSWORD_LENGTH } from "@/lib/onboarding/schemas";
import { cn } from "@/lib/utils";
import { Callout } from "./callout";
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
        <Callout icon={<CheckCircleIcon className="text-pos" />}>
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
        </Callout>
        <StepFooter navigation={navigation} />
      </div>
    );
  }

  return <PasswordForm navigation={navigation} submitPassword={submitPassword} />;
}

function PasswordForm({ navigation, submitPassword }: Omit<PasswordStepProps, "passwordSource">) {
  const passwordId = useId();
  const confirmationId = useId();
  const passwordNoteId = useId();
  const confirmationNoteId = useId();
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const refocus = useRef(false);
  const [pending, startTransition] = useTransition();

  // After a refused submit, focus lands on the first field in error, which
  // reads its message out through `aria-describedby`. It waits for `pending`
  // to clear: the inputs are disabled until then and cannot take focus.
  useEffect(() => {
    if (pending || !refocus.current) return;
    refocus.current = false;
    if (fieldErrors.password) passwordRef.current?.focus();
    else if (fieldErrors.confirmation) confirmationRef.current?.focus();
  }, [pending, fieldErrors]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await submitPassword({ password, confirmation });
      if (result.fieldErrors || result.error) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.fieldErrors ? null : (result.error ?? null));
        refocus.current = true;
        return;
      }
      navigation.advance();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor={passwordId}>סיסמה</Label>
          <Input
            ref={passwordRef}
            id={passwordId}
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={passwordNoteId}
            disabled={pending}
          />
          <FieldNote id={passwordNoteId} error={fieldErrors.password}>
            {`לפחות ${MIN_PASSWORD_LENGTH} תווים`}
          </FieldNote>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={confirmationId}>אימות סיסמה</Label>
          <Input
            ref={confirmationRef}
            id={confirmationId}
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            aria-invalid={fieldErrors.confirmation ? true : undefined}
            aria-describedby={fieldErrors.confirmation ? confirmationNoteId : undefined}
            disabled={pending}
          />
          {fieldErrors.confirmation && (
            <FieldNote id={confirmationNoteId} error={fieldErrors.confirmation} />
          )}
        </div>
        {formError && (
          <p role="alert" className="text-destructive text-body flex items-start gap-1.5">
            <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
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

/** A field's hint, or its error in its place: one element, so `aria-describedby` never dangles. */
function FieldNote({
  id,
  error,
  children,
}: {
  id: string;
  error?: string;
  children?: React.ReactNode;
}) {
  return (
    <p
      id={id}
      className={cn(
        "text-caption flex items-start gap-1.5",
        error ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {error && <WarningCircleIcon className="mt-px size-3.5 shrink-0" />}
      {error ?? children}
    </p>
  );
}
