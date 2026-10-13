"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PasswordSource } from "@/lib/auth";
import { SETUP_RESUME_COOKIE, type SetupStep } from "@/lib/onboarding/steps";
import type { SubmitPassword } from "./password-step";
import { WizardShell } from "./wizard-shell";

const RESUME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type SetupWizardProps = {
  readonly step: SetupStep;
  readonly passwordSource: PasswordSource;
  readonly submitPassword: SubmitPassword;
  readonly completeOnboarding: () => Promise<void>;
};

/**
 * Each step is its own URL (`/setup?step=…`), so the server re-checks the
 * session and completion on every move, and reload, back and forward all land
 * on the right step.
 */
export function SetupWizard({
  step,
  passwordSource,
  submitPassword,
  completeOnboarding,
}: SetupWizardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    document.cookie = `${SETUP_RESUME_COOKIE}=${step}; path=/setup; max-age=${RESUME_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  }, [step]);

  return (
    <WizardShell
      variant="stepper"
      step={step}
      passwordSource={passwordSource}
      pending={pending}
      onNavigate={(target) => startTransition(() => router.push(`/setup?step=${target}`))}
      onFinish={() => startTransition(() => completeOnboarding())}
      submitPassword={submitPassword}
      exitHref={passwordSource === "none" ? null : "/"}
    />
  );
}
