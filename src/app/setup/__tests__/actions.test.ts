import { describe, it, expect, vi, beforeEach } from "vitest";

// Action-seam tests (credentials/categories suites are prior art): the modules
// are mocked at the boundary, so these pin the boundary itself — invalid input
// never reaches the module, a refused claim never signs anyone in, and the
// completion action never runs without a session.

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/onboarding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/onboarding")>();
  return { ...actual, setInitialPassword: vi.fn(), finishOnboarding: vi.fn() };
});

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, establishSession: vi.fn(), requireSession: vi.fn() };
});

import { redirect } from "next/navigation";
import { finishOnboarding, setInitialPassword } from "@/lib/onboarding";
import { establishSession, requireSession } from "@/lib/auth";
import { completeOnboardingAction, setInitialPasswordAction } from "../actions";

const VALID = { password: "synthetic-password", confirmation: "synthetic-password" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setInitialPasswordAction", () => {
  it("rejects a mismatched confirmation without touching the module", async () => {
    const result = await setInitialPasswordAction({ ...VALID, confirmation: "different-value" });

    expect(result.fieldErrors?.confirmation).toBe("הסיסמאות אינן תואמות");
    expect(setInitialPassword).not.toHaveBeenCalled();
    expect(establishSession).not.toHaveBeenCalled();
  });

  it("rejects non-object input without touching the module", async () => {
    const result = await setInitialPasswordAction("not an object");

    expect(result.error).toBeTruthy();
    expect(setInitialPassword).not.toHaveBeenCalled();
  });

  it("signs the user in when this submission claimed the password", async () => {
    vi.mocked(setInitialPassword).mockResolvedValue("set");
    const result = await setInitialPasswordAction(VALID);

    expect(result).toEqual({});
    expect(setInitialPassword).toHaveBeenCalledWith("synthetic-password");
    expect(establishSession).toHaveBeenCalledOnce();
  });

  it("refuses a replay after the password is set, and signs nobody in", async () => {
    vi.mocked(setInitialPassword).mockResolvedValue("already-set");
    const result = await setInitialPasswordAction(VALID);

    expect(result.error).toBeTruthy();
    expect(establishSession).not.toHaveBeenCalled();
  });

  it("refuses on an override install, and signs nobody in", async () => {
    vi.mocked(setInitialPassword).mockResolvedValue("environment-override");
    const result = await setInitialPasswordAction(VALID);

    expect(result.error).toBeTruthy();
    expect(establishSession).not.toHaveBeenCalled();
  });

  it("refuses identically whether or not the override is set, so an anonymous caller learns nothing", async () => {
    vi.mocked(setInitialPassword).mockResolvedValueOnce("environment-override");
    const override = await setInitialPasswordAction(VALID);
    vi.mocked(setInitialPassword).mockResolvedValueOnce("already-set");
    const stored = await setInitialPasswordAction(VALID);

    expect(override).toEqual(stored);
  });

  it("never echoes the submitted password back", async () => {
    vi.mocked(setInitialPassword).mockResolvedValue("already-set");
    const refused = await setInitialPasswordAction(VALID);
    const invalid = await setInitialPasswordAction({ password: "short", confirmation: "short" });

    expect(JSON.stringify([refused, invalid])).not.toMatch(/synthetic-password|short"/);
  });

  it("does not require a session, since none can exist before the first password", async () => {
    vi.mocked(setInitialPassword).mockResolvedValue("set");
    await setInitialPasswordAction(VALID);
    expect(requireSession).not.toHaveBeenCalled();
  });
});

describe("completeOnboardingAction", () => {
  it("refuses without a session, before recording anything", async () => {
    const signInRedirect = new Error("NEXT_REDIRECT");
    vi.mocked(requireSession).mockRejectedValue(signInRedirect);

    await expect(completeOnboardingAction()).rejects.toBe(signInRedirect);
    expect(requireSession).toHaveBeenCalledWith("/setup");
    expect(finishOnboarding).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("records completion and enters the app", async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);
    vi.mocked(finishOnboarding).mockResolvedValue(true);

    await completeOnboardingAction();
    expect(finishOnboarding).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("still enters the app when another tab already completed onboarding", async () => {
    vi.mocked(requireSession).mockResolvedValue(undefined);
    vi.mocked(finishOnboarding).mockResolvedValue(false);

    await completeOnboardingAction();
    expect(redirect).toHaveBeenCalledWith("/");
  });
});
