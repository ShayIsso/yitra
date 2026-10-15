import { signInUrl, type PasswordSource } from "@/lib/auth";
import type { SetupStep } from "./steps";

export type SetupState = {
  readonly completed: boolean;
  readonly passwordSource: PasswordSource;
  readonly hasSession: boolean;
};

export type SetupRequest = {
  /** The `?step=` in the address, already parsed. */
  readonly requestedStep: SetupStep | null;
  /** The last step this browser reached, remembered so a bare `/setup` resumes there. */
  readonly resumeStep: SetupStep | null;
};

export type SetupView =
  | { readonly kind: "redirect"; readonly to: string }
  | { readonly kind: "step"; readonly step: SetupStep };

const FIRST_STEP_AFTER_PASSWORD: SetupStep = "categories";

/**
 * What `/setup` shows. The order of the checks is the security model:
 * completion closes the wizard for good; with no password anywhere the
 * password step is the only thing reachable, and it needs no session because
 * nobody can have one yet; once a password exists, every step requires a
 * session — so the wizard can never be used to reach past the password.
 */
export function resolveSetupView(state: SetupState, request: SetupRequest): SetupView {
  if (state.completed) return { kind: "redirect", to: "/" };
  if (state.passwordSource === "none") return { kind: "step", step: "password" };
  if (!state.hasSession) return { kind: "redirect", to: signInUrl("/setup") };

  const resumeStep = request.resumeStep === "password" ? null : request.resumeStep;
  return { kind: "step", step: request.requestedStep ?? resumeStep ?? FIRST_STEP_AFTER_PASSWORD };
}

export type LoginView =
  | { readonly kind: "sign-in" }
  | { readonly kind: "redirect"; readonly to: "/setup" }
  | { readonly kind: "unconfigured" };

/**
 * A fresh install has no password to sign in with, so the login form would
 * reject every attempt; it goes to the wizard instead. A *completed* install
 * with no password (the override was removed after setup) is not sent back to
 * the wizard — reopening the password step after completion is exactly what
 * ADR-0014 §4 forbids — so it is told what to configure.
 */
export function resolveLoginView(state: Omit<SetupState, "hasSession">): LoginView {
  if (state.passwordSource !== "none") return { kind: "sign-in" };
  return state.completed ? { kind: "unconfigured" } : { kind: "redirect", to: "/setup" };
}

/**
 * Where a successful sign-in lands. An allowlist, not a sanitiser: the only
 * caller that asks to come back is the wizard, and anything else — including an
 * attacker-supplied absolute or protocol-relative URL — goes to the dashboard.
 */
export function loginDestination(next: string | undefined): "/" | "/setup" {
  return next === "/setup" ? "/setup" : "/";
}
