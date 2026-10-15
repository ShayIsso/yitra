import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/setup/institution-actions", () => ({
  addInstitutionCredentialAction: vi.fn(),
  removeInstitutionCredentialAction: vi.fn(),
}));

import { ConnectedSummary } from "@/components/onboarding/steps/institution-step";
import type { StepNavigation } from "@/components/onboarding/step-navigation";

const navigation: StepNavigation = {
  advance: () => undefined,
  skip: () => undefined,
  back: () => undefined,
  isLast: false,
  pending: false,
};

describe("the wizard's connected institutions", () => {
  it("offers a remove control for each connected credential, so a rejected one can be re-added", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectedSummary, {
        connected: [
          { id: "cred-1", bankType: "synthetic-bank", displayName: "Synthetic checking" },
          { id: "cred-2", bankType: "synthetic-card", displayName: "Synthetic card" },
        ],
        onAddAnother: () => undefined,
        onRemoved: () => undefined,
        navigation,
      }),
    );
    expect(html).toContain('aria-label="הסרת Synthetic checking"');
    expect(html).toContain('aria-label="הסרת Synthetic card"');
  });
});
