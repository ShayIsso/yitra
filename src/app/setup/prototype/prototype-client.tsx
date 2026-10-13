"use client";

import { useState } from "react";
import Link from "next/link";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import type { FrameVariant } from "@/components/onboarding/setup-frame";
import type { SubmitPassword } from "@/components/onboarding/password-step";
import { formatZodFieldErrors } from "@/lib/api-utils";
import type { PasswordSource } from "@/lib/auth";
import { initialPasswordSchema } from "@/lib/onboarding/schemas";
import { SETUP_STEPS, type SetupStep } from "@/lib/onboarding/steps";
import { cn } from "@/lib/utils";

const VARIANTS: { key: string; variant: FrameVariant; label: string }[] = [
  { key: "a", variant: "stepper", label: "A · סטפר וכרטיס" },
  { key: "b", variant: "rail", label: "B · מסילה צדדית" },
  { key: "c", variant: "focus", label: "C · מסך ממוקד" },
];

const SOURCES: { value: PasswordSource; label: string }[] = [
  { value: "none", label: "התקנה חדשה" },
  { value: "stored", label: "סיסמה נשמרה" },
  { value: "environment", label: "APP_PASSWORD" },
];

export function PrototypeClient({ variant }: { variant: FrameVariant }) {
  const [step, setStep] = useState<SetupStep>("password");
  const [passwordSource, setPasswordSource] = useState<PasswordSource>("none");
  const [finished, setFinished] = useState(false);

  const submitPassword: SubmitPassword = async (input) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    const parsed = initialPasswordSchema.safeParse(input);
    if (!parsed.success) return { fieldErrors: formatZodFieldErrors(parsed.error) };
    setPasswordSource("stored");
    return {};
  };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="bg-muted border-border flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-xs">
        <span className="font-semibold">אב-טיפוס #258</span>
        <div className="flex flex-wrap gap-1">
          {VARIANTS.map((v) => (
            <Link
              key={v.key}
              href={`/setup/prototype?variant=${v.key}`}
              className={cn(
                "rounded-md px-2 py-1",
                v.variant === variant
                  ? "bg-card text-foreground font-medium"
                  : "text-muted-foreground",
              )}
            >
              {v.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => {
                setPasswordSource(s.value);
                if (s.value === "none") setStep("password");
              }}
              className={cn(
                "rounded-md px-2 py-1",
                s.value === passwordSource
                  ? "bg-card text-foreground font-medium"
                  : "text-muted-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {SETUP_STEPS.map((s, i) => (
            <button
              key={s}
              type="button"
              disabled={s !== "password" && passwordSource === "none"}
              onClick={() => setStep(s)}
              className={cn(
                "rounded-md px-2 py-1 tabular-nums disabled:opacity-40",
                s === step ? "bg-card text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {finished ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-sm">
          <p>ההגדרה הושלמה — באפליקציה האמיתית זה המעבר ללוח הבקרה.</p>
          <button
            type="button"
            className="text-muted-foreground underline"
            onClick={() => {
              setFinished(false);
              setPasswordSource("none");
              setStep("password");
            }}
          >
            להתחיל מחדש
          </button>
        </div>
      ) : (
        <WizardShell
          variant={variant}
          step={step}
          passwordSource={passwordSource}
          pending={false}
          onNavigate={setStep}
          onFinish={() => setFinished(true)}
          submitPassword={submitPassword}
          exitHref={passwordSource === "none" ? null : "/setup/prototype"}
        />
      )}
    </div>
  );
}
