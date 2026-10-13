import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SetupWizard } from "@/components/onboarding/setup-wizard";
import { hasValidSession } from "@/lib/auth";
import {
  SETUP_RESUME_COOKIE,
  parseSetupStep,
  readSetupState,
  resolveSetupView,
} from "@/lib/onboarding";
import { completeOnboardingAction, setInitialPasswordAction } from "./actions";

/** Reads the database and the session on every request; never prerendered. */
export const dynamic = "force-dynamic";

/**
 * The first-run wizard (ADR-0014 §4–5). The middleware lets every request
 * through unauthenticated, so this page is where access is decided — see
 * `resolveSetupView` for the order of checks. It is not the security boundary
 * for writes: each action guards itself.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, jar] = await Promise.all([searchParams, cookies()]);
  const state = await readSetupState(await hasValidSession());
  const view = resolveSetupView(state, {
    requestedStep: parseSetupStep(params.step),
    resumeStep: parseSetupStep(jar.get(SETUP_RESUME_COOKIE)?.value),
  });

  if (view.kind === "redirect") redirect(view.to);

  return (
    <SetupWizard
      step={view.step}
      passwordSource={state.passwordSource}
      submitPassword={setInitialPasswordAction}
      completeOnboarding={completeOnboardingAction}
    />
  );
}
