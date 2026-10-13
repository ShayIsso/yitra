import { describe, it, expect } from "vitest";
import {
  SETUP_STEPS,
  loginDestination,
  parseSetupStep,
  resolveLoginView,
  resolveSetupView,
  stepAfter,
  stepBefore,
  type SetupState,
} from "..";

const FRESH: SetupState = { completed: false, passwordSource: "none", hasSession: false };

describe("setup steps", () => {
  it("runs password, categories, institution, provider, then first sync", () => {
    expect(SETUP_STEPS).toEqual([
      "password",
      "categories",
      "institution",
      "provider",
      "first-sync",
    ]);
  });

  it("steps forward and back through that order", () => {
    expect(stepAfter("categories")).toBe("institution");
    expect(stepBefore("institution")).toBe("categories");
  });

  it("has nothing after the first sync, so finishing it completes onboarding", () => {
    expect(stepAfter("first-sync")).toBeNull();
  });

  it("has nothing before the password step", () => {
    expect(stepBefore("password")).toBeNull();
  });

  it.each([undefined, "", "dashboard", "PASSWORD", "__proto__", ["categories"]])(
    "reads %j as no step",
    (raw) => {
      expect(parseSetupStep(raw)).toBeNull();
    },
  );

  it("reads a known step id", () => {
    expect(parseSetupStep("provider")).toBe("provider");
  });
});

describe("resolveSetupView", () => {
  const NO_REQUEST = { requestedStep: null, resumeStep: null };

  it("sends a completed install to the dashboard, whatever else is true", () => {
    for (const passwordSource of ["none", "stored", "environment"] as const) {
      expect(
        resolveSetupView(
          { completed: true, passwordSource, hasSession: true },
          { requestedStep: "password", resumeStep: null },
        ),
      ).toEqual({ kind: "redirect", to: "/" });
    }
  });

  it("shows the password step on a fresh install, with no session needed", () => {
    expect(resolveSetupView(FRESH, NO_REQUEST)).toEqual({ kind: "step", step: "password" });
  });

  it("holds a fresh install on the password step whatever step is requested", () => {
    expect(
      resolveSetupView(FRESH, { requestedStep: "first-sync", resumeStep: "provider" }),
    ).toEqual({ kind: "step", step: "password" });
  });

  it.each(["stored", "environment"] as const)(
    "sends a visitor without a session to sign in when the password comes from %s",
    (passwordSource) => {
      expect(
        resolveSetupView({ completed: false, passwordSource, hasSession: false }, NO_REQUEST),
      ).toEqual({ kind: "redirect", to: "/login?next=%2Fsetup" });
    },
  );

  it("opens a signed-in visitor on the first step after the password", () => {
    expect(
      resolveSetupView(
        { completed: false, passwordSource: "stored", hasSession: true },
        NO_REQUEST,
      ),
    ).toEqual({ kind: "step", step: "categories" });
  });

  it("resumes at the step the visitor last reached", () => {
    expect(
      resolveSetupView(
        { completed: false, passwordSource: "stored", hasSession: true },
        { requestedStep: null, resumeStep: "provider" },
      ),
    ).toEqual({ kind: "step", step: "provider" });
  });

  it("prefers the step in the address over the remembered one", () => {
    expect(
      resolveSetupView(
        { completed: false, passwordSource: "stored", hasSession: true },
        { requestedStep: "institution", resumeStep: "provider" },
      ),
    ).toEqual({ kind: "step", step: "institution" });
  });

  it("does not resume onto the password step once a password exists", () => {
    expect(
      resolveSetupView(
        { completed: false, passwordSource: "stored", hasSession: true },
        { requestedStep: null, resumeStep: "password" },
      ),
    ).toEqual({ kind: "step", step: "categories" });
  });

  it("shows the password step as already satisfied when navigated back to", () => {
    expect(
      resolveSetupView(
        { completed: false, passwordSource: "environment", hasSession: true },
        { requestedStep: "password", resumeStep: null },
      ),
    ).toEqual({ kind: "step", step: "password" });
  });
});

describe("resolveLoginView", () => {
  it.each(["stored", "environment"] as const)(
    "shows the sign-in form when the password comes from %s",
    (passwordSource) => {
      expect(resolveLoginView({ completed: false, passwordSource })).toEqual({ kind: "sign-in" });
      expect(resolveLoginView({ completed: true, passwordSource })).toEqual({ kind: "sign-in" });
    },
  );

  it("sends a fresh install to the setup wizard instead of a form that can never succeed", () => {
    expect(resolveLoginView({ completed: false, passwordSource: "none" })).toEqual({
      kind: "redirect",
      to: "/setup",
    });
  });

  it("explains a completed install with no password rather than reopening setup", () => {
    expect(resolveLoginView({ completed: true, passwordSource: "none" })).toEqual({
      kind: "unconfigured",
    });
  });
});

describe("loginDestination", () => {
  it("returns to the setup wizard when sign-in was asked for by it", () => {
    expect(loginDestination("/setup")).toBe("/setup");
  });

  it.each([
    undefined,
    "",
    "/settings",
    "https://elsewhere.example",
    "//elsewhere.example",
    "/setupx",
  ])("goes to the dashboard for %j", (next) => {
    expect(loginDestination(next)).toBe("/");
  });
});
