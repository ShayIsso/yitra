import { describe, it, expect, vi } from "vitest";
import { buildStepNavigation } from "@/components/onboarding/step-navigation";

function handlers() {
  return { onNavigate: vi.fn(), onFinish: vi.fn(), pending: false };
}

describe("the wizard's step navigation", () => {
  it("completes onboarding when the last step is advanced", () => {
    const h = handlers();
    const navigation = buildStepNavigation("first-sync", h);

    navigation.advance();

    expect(navigation.isLast).toBe(true);
    expect(h.onFinish).toHaveBeenCalledOnce();
    expect(h.onNavigate).not.toHaveBeenCalled();
  });

  it("also completes onboarding when the last step is skipped", () => {
    const h = handlers();
    buildStepNavigation("first-sync", h).skip?.();

    expect(h.onFinish).toHaveBeenCalledOnce();
    expect(h.onNavigate).not.toHaveBeenCalled();
  });

  it("moves to the next and previous steps everywhere else", () => {
    const h = handlers();
    const navigation = buildStepNavigation("provider", h);

    navigation.advance();
    navigation.back?.();

    expect(h.onNavigate.mock.calls).toEqual([["first-sync"], ["institution"]]);
    expect(h.onFinish).not.toHaveBeenCalled();
  });

  it("offers no skip on the mandatory password step and no back on the first", () => {
    const navigation = buildStepNavigation("password", handlers());
    expect(navigation.skip).toBeNull();
    expect(navigation.back).toBeNull();
  });
});
