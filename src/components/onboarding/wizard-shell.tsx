"use client";

import type { ComponentType } from "react";
import type { PasswordSource } from "@/lib/auth";
import { stepAfter, stepBefore, type SetupStep } from "@/lib/onboarding/steps";
import { PasswordStep, type SubmitPassword } from "./password-step";
import { SetupFrame } from "./setup-frame";
import type { SetupStepProps, StepNavigation } from "./step-navigation";
import { CategoriesStep } from "./steps/categories-step";
import { FirstSyncStep } from "./steps/first-sync-step";
import { InstitutionStep } from "./steps/institution-step";
import { ProviderStep } from "./steps/provider-step";

const STEP_BODIES: Record<Exclude<SetupStep, "password">, ComponentType<SetupStepProps>> = {
  categories: CategoriesStep,
  institution: InstitutionStep,
  provider: ProviderStep,
  "first-sync": FirstSyncStep,
};

export type WizardShellProps = {
  readonly step: SetupStep;
  readonly passwordSource: PasswordSource;
  readonly pending: boolean;
  readonly onNavigate: (step: SetupStep) => void;
  /** Completes onboarding; reached by advancing or skipping past the last step. */
  readonly onFinish: () => void;
  readonly submitPassword: SubmitPassword;
  readonly exitHref: string | null;
};

export function WizardShell({
  step,
  passwordSource,
  pending,
  onNavigate,
  onFinish,
  submitPassword,
  exitHref,
}: WizardShellProps) {
  const next = stepAfter(step);
  const previous = stepBefore(step);
  const forward = () => (next ? onNavigate(next) : onFinish());

  const navigation: StepNavigation = {
    advance: forward,
    skip: step === "password" ? null : forward,
    back: previous ? () => onNavigate(previous) : null,
    isLast: next === null,
    pending,
  };

  const Body = step === "password" ? null : STEP_BODIES[step];

  return (
    <SetupFrame step={step} passwordDone={passwordSource !== "none"} exitHref={exitHref}>
      {Body ? (
        <Body navigation={navigation} />
      ) : (
        <PasswordStep
          navigation={navigation}
          passwordSource={passwordSource}
          submitPassword={submitPassword}
        />
      )}
    </SetupFrame>
  );
}
