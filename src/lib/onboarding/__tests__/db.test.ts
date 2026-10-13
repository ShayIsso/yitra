import { describe, it, expect, vi, afterEach } from "vitest";
import { EMPTY_APP_SETTINGS, type AppSettings } from "@/lib/app-settings";

/** `getEnv` memoizes, so each case re-imports against a fresh `APP_PASSWORD`. */
async function loadOnboarding(appPassword: string | undefined) {
  vi.resetModules();
  if (appPassword === undefined) delete process.env.APP_PASSWORD;
  else process.env.APP_PASSWORD = appPassword;
  return import("..");
}

const ORIGINAL_APP_PASSWORD = process.env.APP_PASSWORD;
const OVERRIDE = "$2b$04$syntheticoverridehashplaceholderxxxxxxxxxxxxxxxxxxxxx";

afterEach(() => {
  if (ORIGINAL_APP_PASSWORD === undefined) delete process.env.APP_PASSWORD;
  else process.env.APP_PASSWORD = ORIGINAL_APP_PASSWORD;
});

function settingsStore(settings: Partial<AppSettings> = {}) {
  return { read: vi.fn(async () => ({ ...EMPTY_APP_SETTINGS, ...settings })) };
}

describe("readLoginView", () => {
  it("shows the sign-in form on an override install without reading the database", async () => {
    const { readLoginView } = await loadOnboarding(OVERRIDE);
    const store = settingsStore();

    expect(await readLoginView(store)).toEqual({ kind: "sign-in" });
    expect(store.read).not.toHaveBeenCalled();
  });

  it("sends a fresh install to the setup wizard", async () => {
    const { readLoginView } = await loadOnboarding(undefined);
    expect(await readLoginView(settingsStore())).toEqual({ kind: "redirect", to: "/setup" });
  });

  it("shows the sign-in form once the wizard has stored a password", async () => {
    const { readLoginView } = await loadOnboarding(undefined);
    expect(await readLoginView(settingsStore({ hasAppPassword: true }))).toEqual({
      kind: "sign-in",
    });
  });
});

describe("readSetupState", () => {
  it("treats an override install that never ran the wizard as incomplete, with its password from the environment", async () => {
    const { readSetupState } = await loadOnboarding(OVERRIDE);
    expect(await readSetupState(false, settingsStore())).toEqual({
      completed: false,
      passwordSource: "environment",
      hasSession: false,
    });
  });

  it("reports a completed install as completed", async () => {
    const { readSetupState } = await loadOnboarding(undefined);
    const state = await readSetupState(
      true,
      settingsStore({ onboardingCompletedAt: new Date("2026-03-04T00:00:00.000Z") }),
    );
    expect(state.completed).toBe(true);
  });
});

describe("setInitialPassword", () => {
  it("refuses without writing on an override install", async () => {
    const { setInitialPassword } = await loadOnboarding(OVERRIDE);
    const store = { ...settingsStore(), claimAppPassword: vi.fn(async () => true) };

    expect(await setInitialPassword("synthetic-password", store)).toBe("environment-override");
    expect(store.claimAppPassword).not.toHaveBeenCalled();
  });
});
